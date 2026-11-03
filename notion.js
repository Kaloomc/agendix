// Stockage dans Notion via l'API officielle (https://developers.notion.com).
// NOTION_TOKEN   : jeton de l'intégration Notion (reste sur le serveur)
// NOTION_PAGE_ID : page Notion qui contient la base ; elle est créée au premier lancement si besoin.
const VERSION = '2022-06-28';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const versNotion = (type, v) => ({
  title: () => ({ title: [{ text: { content: String(v ?? '').slice(0, 2000) } }] }),
  number: () => ({ number: Number.isFinite(v) ? v : null }),
  select: () => ({ select: v ? { name: String(v).replace(/,/g, ' ') } : null }),
  date: () => ({ date: v ? { start: v } : null }),
}[type]());

const depuisNotion = (p) => ({
  title: () => p.title.map((t) => t.plain_text).join(''),
  number: () => p.number,
  select: () => p.select?.name ?? null,
  date: () => p.date?.start ?? null,
}[p.type]?.());

module.exports = function notion(titre, CHAMPS, nettoyer) {
  const token = process.env.NOTION_TOKEN;
  // Accepte l'identifiant seul ou le lien complet de la page.
  const pageId = (process.env.NOTION_PAGE_ID || '').match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0];

  // Notion accepte environ 3 requêtes par seconde : on les espace de 340 ms.
  let prochain = 0;
  const tour = () => {
    const t = Math.max(Date.now(), prochain);
    prochain = t + 340;
    return pause(t - Date.now());
  };

  async function api(method, chemin, body) {
    for (let essai = 0; ; essai++) {
      await tour();
      const res = await fetch('https://api.notion.com/v1' + chemin, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
      if ((res.status === 429 || res.status >= 500) && essai < 4) {
        await pause((Number(res.headers.get('retry-after')) || 1) * 1000);
        continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(`Notion : ${data.message}`);
      return data;
    }
  }

  // Trouve la base dans la page, la crée si elle manque.
  let base;
  async function init() {
    if (!pageId) throw new Error('NOTION_PAGE_ID manquant : indique la page Notion qui accueille la base.');
    const properties = Object.fromEntries(Object.values(CHAMPS).map(([nom, type]) => [nom, { [type]: {} }]));
    let curseur;
    do {
      const r = await api('GET', `/blocks/${pageId}/children?page_size=100${curseur ? `&start_cursor=${curseur}` : ''}`);
      const trouvee = r.results.find((b) => b.type === 'child_database' && b.child_database.title === titre);
      if (trouvee) {
        // Base existante : on ajoute les colonnes apparues dans une nouvelle version de l'appli.
        const existantes = (await api('GET', `/databases/${trouvee.id}`)).properties;
        const manquantes = Object.fromEntries(Object.entries(properties).filter(([nom, p]) => !existantes[nom] && !p.title));
        if (Object.keys(manquantes).length) await api('PATCH', `/databases/${trouvee.id}`, { properties: manquantes });
        return trouvee.id;
      }
      curseur = r.next_cursor;
    } while (curseur);
    const db = await api('POST', '/databases', {
      parent: { type: 'page_id', page_id: pageId },
      title: [{ text: { content: titre } }],
      properties,
    });
    return db.id;
  }
  const getBase = () => (base ??= init().catch((err) => { base = null; throw err; }));

  const proprietes = (obj) =>
    Object.fromEntries(Object.entries(nettoyer(obj)).map(([k, v]) => {
      const [nom, type] = CHAMPS[k];
      return [nom, versNotion(type, v)];
    }));

  const lire = (page) => {
    const obj = { id: page.id };
    for (const [k, [nom]] of Object.entries(CHAMPS)) obj[k] = page.properties[nom] ? depuisNotion(page.properties[nom]) : null;
    return obj;
  };

  return {
    mode: 'notion',
    async list() {
      const id = await getBase();
      const out = [];
      let curseur;
      do {
        const r = await api('POST', `/databases/${id}/query`, { page_size: 100, ...(curseur && { start_cursor: curseur }) });
        out.push(...r.results.map(lire));
        curseur = r.next_cursor;
      } while (curseur);
      return out;
    },
    add: async (obj) => lire(await api('POST', '/pages', { parent: { database_id: await getBase() }, properties: proprietes(obj) })),
    update: async (id, patch) => lire(await api('PATCH', `/pages/${id}`, { properties: proprietes(patch) })),
    remove: async (id) => {
      await api('PATCH', `/pages/${id}`, { archived: true });
    },
  };
};
