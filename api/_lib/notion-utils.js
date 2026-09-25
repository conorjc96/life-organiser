function getTitle(prop) {
  return (prop?.title || []).map((t) => t.plain_text).join('');
}

function getRichText(prop) {
  return (prop?.rich_text || []).map((t) => t.plain_text).join('');
}

function getSelect(prop) {
  return prop?.select?.name ?? null;
}

function getMultiSelect(prop) {
  return (prop?.multi_select || []).map((o) => o.name);
}

function getDate(prop) {
  return prop?.date?.start ?? null;
}

function getCheckbox(prop) {
  return Boolean(prop?.checkbox);
}

function getUrl(prop) {
  return prop?.url ?? null;
}

function getRelationIds(prop) {
  return (prop?.relation || []).map((r) => r.id);
}

function getRollup(prop) {
  const rollup = prop?.rollup;
  if (!rollup) return null;
  if (rollup.type === 'number') return rollup.number;
  if (rollup.type === 'array') return rollup.array;
  return null;
}

function getFormula(prop) {
  const formula = prop?.formula;
  if (!formula) return null;
  if (formula.type === 'number') return formula.number;
  if (formula.type === 'string') return formula.string;
  if (formula.type === 'boolean') return formula.boolean;
  if (formula.type === 'date') return formula.date?.start ?? null;
  return null;
}

module.exports = {
  getTitle,
  getRichText,
  getSelect,
  getMultiSelect,
  getDate,
  getCheckbox,
  getUrl,
  getRelationIds,
  getRollup,
  getFormula,
};
