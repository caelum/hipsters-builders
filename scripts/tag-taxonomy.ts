/**
 * Tag taxonomy: maps ~1300 raw tags to ~20 consolidated topics.
 *
 * Each topic has:
 * - label: display name (Portuguese)
 * - matches: exact raw tags that map to this topic
 * - patterns: regex patterns for fuzzy matching
 *
 * A raw tag can map to multiple topics (N:M).
 * Tags that don't match anything are dropped from the UI
 * (but preserved in the raw frontmatter).
 */

export interface Topic {
  id: string;
  label: string;
  matches: string[];
  patterns: RegExp[];
}

export const topics: Topic[] = [
  {
    id: 'ia',
    label: 'Inteligencia Artificial',
    matches: [
      'inteligência artificial', 'inteligência artificial generativa',
      'ia generativa', 'agi', 'agentic ai',
      'modelos de linguagem', 'modelo de linguagem', 'llm', 'llms',
      'deep learning', 'machine learning', 'redes neurais',
      'transformers', 'fine-tuning', 'rag',
      'processamento de linguagem natural', 'nlp',
      'visão computacional', 'multimodalidade',
      'alucinação', 'alucinação de IA', 'alucinações',
      'benchmarks', 'treinamento de modelos',
      'alinhamento', 'alinhamento de IA',
    ],
    patterns: [/\bia\b/, /intelig[eê]ncia artificial/, /machine.?learning/, /deep.?learning/],
  },
  {
    id: 'agentes',
    label: 'Agentes de IA',
    matches: [
      'agentes de ia', 'agentes de IA', 'agentes de inteligência artificial',
      'agentes', 'agentes autônomos', 'agentes automáticos',
      'agent engineering', 'orquestração',
    ],
    patterns: [/agent/, /orquestra/],
  },
  {
    id: 'ferramentas-ia',
    label: 'Ferramentas de IA',
    matches: [
      'chatgpt', 'claude', 'claude code', 'gemini', 'copilot',
      'openai', 'anthropic', 'google', 'microsoft', 'perplexity',
      'midjourney', 'sora', 'gpt-5', 'gpt-4', 'gpt-4o',
      'ferramentas de ia', 'ai coding assistants',
      'amazon bedrock', 'amazon nova', 'amazon q',
    ],
    patterns: [/^gpt/, /^claude/, /^gemini/, /^llama/, /^mistral/, /^deepseek/],
  },
  {
    id: 'dev',
    label: 'Desenvolvimento',
    matches: [
      'desenvolvimento de software', 'desenvolvimento', 'programação',
      'arquitetura de software', 'arquitetura de sistemas', 'arquitetura',
      'ferramentas de desenvolvimento', 'framework',
      'api', 'api rest', 'apis', 'microserviços',
      'performance', 'escalabilidade', 'infraestrutura',
      'devops', 'deploy', 'ci/cd',
      'engenharia de software', 'qualidade de código',
      'testes', 'qa', 'refatoração',
      'versionamento', 'git', 'github',
    ],
    patterns: [/programa[çc][aã]o/, /arquitetura/, /develop/, /engenharia de s/],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    matches: [
      'front-end', 'frontend', 'desenvolvimento frontend',
      'react', 'angular', 'vue', 'svelte', 'next.js', 'astro',
      'javascript', 'typescript', 'css', 'html',
      'html semântico', 'webpack', 'babel',
      'renderização estática', 'ssr', 'server-side rendering',
      'fetch api', 'web storage', 'websocket',
    ],
    patterns: [/front.?end/, /javascript/, /typescript/, /react/, /angular/, /vue/],
  },
  {
    id: 'backend',
    label: 'Backend',
    matches: [
      'back-end', 'backend', 'full-stack',
      'python', 'java', 'golang', 'c#', 'ruby',
      '.net', '.net core', '.net framework', 'asp.net core',
      'node.js', 'graphql',
    ],
    patterns: [/back.?end/, /python/, /java(?!script)/, /golang/, /node\.js/],
  },
  {
    id: 'banco-de-dados',
    label: 'Banco de Dados',
    matches: [
      'banco de dados', 'sql', 'nosql',
      'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'data engineering',
    ],
    patterns: [/banco de dados/, /database/, /sql/],
  },
  {
    id: 'agile',
    label: 'Agile e Gestao',
    matches: [
      'agile', 'ágil', 'scrum', 'kanban',
      'sprint', 'gestão de equipes', 'cultura organizacional',
      'estratégia de produto',
    ],
    patterns: [/agile/, /[aá]gil/, /scrum/, /kanban/],
  },
  {
    id: 'prompt',
    label: 'Prompt Engineering',
    matches: [
      'engenharia de prompt', 'prompt engineering',
      'prompt', 'contexto', 'reasoning',
    ],
    patterns: [/prompt/, /chain.of.thought/],
  },
  {
    id: 'dados',
    label: 'Dados',
    matches: [
      'análise de dados', 'ciência de dados', 'data science',
      'data engineering', 'big data', 'analytics',
      'embeddings', 'vetores',
    ],
    patterns: [/data/, /dados/],
  },
  {
    id: 'produto',
    label: 'Produto',
    matches: [
      'experiência do usuário', 'ux', 'ui',
      'mvp', 'saas', 'product market fit',
      'validação', 'casos de uso',
    ],
    patterns: [/product/, /produto/],
  },
  {
    id: 'carreira',
    label: 'Carreira',
    matches: [
      'carreira', 'trajetória profissional', 'desenvolvimento profissional',
      'liderança', 'mercado de trabalho', 'recrutamento',
      'soft skills', 'hard skills',
    ],
    patterns: [/carreira/, /profissional/, /lideran/],
  },
  {
    id: 'educacao',
    label: 'Educacao',
    matches: [
      'educação', 'aprendizado', 'academia',
      'alura', 'fiap', 'ensino',
    ],
    patterns: [/educa/, /aprend/, /ensino/],
  },
  {
    id: 'open-source',
    label: 'Open Source',
    matches: [
      'open source', 'código aberto', 'linux', 'git', 'github',
    ],
    patterns: [/open.?source/],
  },
  {
    id: 'startup',
    label: 'Startups',
    matches: [
      'startup', 'startups', 'empreendedorismo',
      'inovação', 'investimento', 'venture capital',
      'vale do silício',
    ],
    patterns: [/startup/, /empreend/],
  },
  {
    id: 'seguranca',
    label: 'Seguranca',
    matches: [
      'segurança', 'cibersegurança', 'privacidade',
      'regulação', 'governança', 'ética',
      'ai act', 'lgpd',
    ],
    patterns: [/seguran/, /privacidade/, /[eé]tica/],
  },
  {
    id: 'saude',
    label: 'Saude',
    matches: [
      'saúde', 'medicina', 'ia em saúde',
      'oncologia', 'diagnóstico',
    ],
    patterns: [/sa[uú]de/, /medicina/, /m[eé]dic/],
  },
  {
    id: 'imagem-audio',
    label: 'Imagem e Audio',
    matches: [
      'geração de imagens', 'text-to-speech', 'speech-to-text',
      'áudio', 'vídeo', 'imagem',
      'midjourney', 'dall-e', 'stable diffusion', 'sora',
    ],
    patterns: [/imagem/, /[aá]udio/, /v[ií]deo/, /genera[çc][aã]o de/],
  },
  {
    id: 'automacao',
    label: 'Automacao',
    matches: [
      'automação', 'produtividade', 'no-code', 'low-code',
      'rpa', 'workflows',
    ],
    patterns: [/automa[çc]/, /produtividade/],
  },
  {
    id: 'hardware',
    label: 'Hardware e Infra',
    matches: [
      'hardware', 'gpu', 'chips', 'semicondutores',
      'cloud', 'aws', 'azure', 'gcp',
      'latência', 'computação',
    ],
    patterns: [/hardware/, /cloud/, /gpu/],
  },
  {
    id: 'brasil',
    label: 'Brasil',
    matches: [
      'brasil', 'mercado brasileiro',
      'indústria', 'transformação digital',
    ],
    patterns: [/brasil/],
  },
  {
    id: 'comunidade',
    label: 'Comunidade',
    matches: [
      'comunidade', 'eventos', 'podcast',
    ],
    patterns: [/comunidade/, /evento/],
  },
  {
    id: 'pesquisa',
    label: 'Pesquisa',
    matches: [
      'pesquisa', 'papers', 'artigos científicos',
      'história da tecnologia', 'história da IA', 'história',
      'evolução tecnológica', 'evolução',
    ],
    patterns: [/pesquisa/, /hist[oó]ria/],
  },
];

/**
 * Map a list of raw tags to consolidated topic IDs.
 * Returns deduplicated, sorted topic IDs.
 */
export function consolidateTags(rawTags: string[]): string[] {
  const result = new Set<string>();

  for (const raw of rawTags) {
    const lower = raw.toLowerCase().trim();

    for (const topic of topics) {
      // Exact match
      if (topic.matches.some(m => m.toLowerCase() === lower)) {
        result.add(topic.id);
        continue;
      }
      // Pattern match
      if (topic.patterns.some(p => p.test(lower))) {
        result.add(topic.id);
      }
    }
  }

  return [...result].sort();
}

/**
 * Get the display label for a topic ID.
 */
export function topicLabel(id: string): string {
  return topics.find(t => t.id === id)?.label ?? id;
}

// --- CLI: preview mapping ---
// Run with: npx tsx scripts/tag-taxonomy.ts
export async function previewMapping() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const matter = (await import('gray-matter')).default;

  const freq = new Map<string, number>();
  for (const dir of ['src/content/episodes', 'src/content/curtas']) {
    const full = path.resolve(dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full).filter(f => f.endsWith('.md'))) {
      const { data } = matter(fs.readFileSync(path.join(full, file), 'utf-8'));
      for (const tag of (data.tags ?? [])) {
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }
  }

  // Top 50 by frequency
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
  console.log('Top 50 tags by frequency:\n');
  for (const [tag, count] of sorted) {
    const mapped = consolidateTags([tag]);
    const status = mapped.length > 0 ? mapped.join(', ') : '❌ UNMAPPED';
    console.log(`${String(count).padStart(4)}  ${tag.padEnd(42)} → ${status}`);
  }

  // Unmapped count
  const allRaw = new Set(freq.keys());
  let unmappedCount = 0;
  for (const tag of allRaw) {
    if (consolidateTags([tag]).length === 0) unmappedCount++;
  }
  console.log(`\nTotal: ${allRaw.size} raw tags, ${allRaw.size - unmappedCount} mapped, ${unmappedCount} unmapped (dropped from UI)`);
}
