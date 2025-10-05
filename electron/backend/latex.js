const JSZip = require('jszip');

const DEFAULT_THEOREM_DEFS = [
  '\\newtheorem{theorem}{Theorem}',
  '\\newtheorem{lemma}{Lemma}',
].join('\n');

function renderMainTex(project) {
  const settings = project.settings?.latex ?? {};
  const documentClass = settings.documentClass || 'article';
  const packages = Array.isArray(settings.packages) ? settings.packages : ['amsmath', 'amsthm', 'amssymb'];
  const preambleParts = [];
  if (typeof settings.preamble === 'string' && settings.preamble.trim().length > 0) {
    preambleParts.push(settings.preamble.trim());
  }
  preambleParts.push(DEFAULT_THEOREM_DEFS);
  const preamble = preambleParts.filter(Boolean).join('\n');
  const packagesLines = packages.map((pkg) => `\\usepackage{${pkg}}`).join('\n');
  return [
    `\\documentclass{${documentClass}}`,
    packagesLines,
    preamble,
    '\\begin{document}',
    `\\title{${project.title || ''}}`,
    `\\author{${project.owner || ''}}`,
    '\\maketitle',
    '\\begin{abstract}',
    project.abstract || 'TODO: Fill abstract',
    '\\end{abstract}',
    '\\tableofcontents',
    '\\input{notation.tex}',
    '\\input{facts.tex}',
    '\\input{lemmas.tex}',
    '\\input{conjectures.tex}',
    '\\end{document}',
    '',
  ].join('\n');
}

function renderNotationTex(project) {
  const lines = ['% Notation'];
  for (const item of project.notation ?? []) {
    const symbol = item.symbol || '';
    const description = item.description || '';
    lines.push(`\\paragraph{${symbol}} ${description}`.trim());
  }
  if (lines.length === 1) {
    lines.push('% No notation defined yet.');
  }
  lines.push('');
  return lines.join('\n');
}

function renderFactsTex(project) {
  const lines = ['% Facts'];
  for (const fact of project.facts ?? []) {
    lines.push(`\\begin{theorem}[${fact.title || fact.id || ''}]\\label{fact:${fact.id}}`);
    lines.push(fact.statementTex || '');
    lines.push('\\end{theorem}');
  }
  if (lines.length === 1) {
    lines.push('% No facts defined yet.');
  }
  lines.push('');
  return lines.join('\n');
}

function renderLemmasTex(project) {
  const lines = ['% Lemmas'];
  for (const lemma of project.lemmas ?? []) {
    lines.push(`\\begin{lemma}[${lemma.title || lemma.id || ''}]\\label{lemma:${lemma.id}}`);
    lines.push(lemma.statementTex || '');
    lines.push('\\end{lemma}');
    if (Array.isArray(lemma.dependsOn) && lemma.dependsOn.length > 0) {
      const deps = lemma.dependsOn.map((dep) => `\\ref{fact:${dep}}`).join(', ');
      lines.push(`\\paragraph{Depends on} ${deps}`);
    }
  }
  if (lines.length === 1) {
    lines.push('% No lemmas defined yet.');
  }
  lines.push('');
  return lines.join('\n');
}

function renderConjecturesTex(project) {
  const lines = ['% Conjectures'];
  for (const conj of project.conjectures ?? []) {
    lines.push(`\\section*{${conj.title || conj.id || ''}}`);
    lines.push(conj.statementTex || '');
    if (conj.evidence) {
      lines.push('\\paragraph{Evidence}');
      lines.push(conj.evidence);
    }
  }
  if (lines.length === 1) {
    lines.push('% No conjectures defined yet.');
  }
  lines.push('');
  return lines.join('\n');
}

async function buildLatexBundle(project) {
  const zip = new JSZip();
  zip.file('main.tex', renderMainTex(project));
  zip.file('notation.tex', renderNotationTex(project));
  zip.file('facts.tex', renderFactsTex(project));
  zip.file('lemmas.tex', renderLemmasTex(project));
  zip.file('conjectures.tex', renderConjecturesTex(project));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, filename: `${project.id}_latex_bundle.zip` };
}

module.exports = {
  buildLatexBundle,
};
