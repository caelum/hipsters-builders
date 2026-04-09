# Hipsters Builders nº 1
*A semana que a Anthropic gastou um jeitinho de não entregar.*

> "Estão sangrando MESMO."
> — Fabrício Carraro, sobre a Anthropic restringir o Claude em apps third-party.

A Anthropic anunciou na quinta o **Claude Mythos**, com vídeo do CEO, system card completo, benchmarks novos — e zero modelo público. O Carraro chamou o gráfico do Mythos de "talvez o gráfico mais significativo" do anúncio. O Marcell, lendo a mesma página, sentenciou: "esse papo de não disponibilizar o modelo, lançar esse projeto com vídeo do CEO etc etc me cheira a marketing stunt". Não chegaram a um acordo. O Paulo deu a leitura mais curta: "bem pertinho do IPO".

Na sequência veio o **Project Glasswing**, com claim de vulnerabilidades em SOs e browsers descobertas pelo Mythos rodando o SWE-bench Verified zerado. Também sem ferramenta pública. O Guilherme Silveira reagiu na ironia que o Clauders esperava dele: "Ufa. Que bom que as empresas americanas estão com essas armas na mão e vão defender o mundo." O Paulo completou: "Vão hackear nossas apps privadamente kkk".

E no meio disso tudo — quase como se fosse pra confirmar a tese — a notícia de que a Anthropic vai cortar o uso do Claude em apps third-party como OpenClaw a partir do dia 4. "Para gerenciar melhor a capacidade." É aí que o Carraro solta o "Estão sangrando MESMO". O Mark Zuckerberg, no mesmo dia, voltou a programar depois de duas décadas de pausa, submeteu três diffs ao monorepo da Meta e é "heavy user do Claude Code CLI". Uma nota de rodapé de uma nota de rodapé.

---

**Quarta. DORA, débito técnico, e o GitHub que enche de verde sem fazer nada.** Rafael Ribeiro reabriu a discussão usando o método DORA adaptado pro Ralph console e levantou a hipótese: "Provavelmente tem haver com o volume de entregas e a falsa sensação de progresso que isso gera". Sem processo bem definido, gera "mto débito técnico". O Paulo reduziu a equação à frase mais útil da semana: "todo mundo com github verdinho mas comitando onde nao precisa". O Aniche complicou: "AI também deixa a pessoa explorar mais, ela abre PR e depois descarta".

E enquanto a métrica tradicional engasga, a discussão sobre quem é dogmático demais sobre TDD apareceu de canto. O Aniche sobre Jason Gorman: "Está pirando no mundo novo. Da mesma escola do Dave Farley". Não é briga, é desabafo: TDD como religião não sobrevive a 2026.

**Sobre a tal "superfície de bugs".** Paulo escreveu no canal do Telegram um texto longo sobre o problema do código agêntico inflar a área de contato bugada do software. Os exemplos do mercado fazem barulho: Daniel Stenberg desligou o bug bounty do cURL depois que 20% das submissões viraram IA. Mitchell Hashimoto baniu código gerado de IA do Ghostty. Steve Ruiz fechou todos os PRs externos do tldraw. A defesa do Paulo: "se você for focado naquilo que quer fazer, tiver domínio de conhecimento de boa parte daquele código, daquela infraestrutura, da arquitetura" — funciona. Quando não, "quem paga a conta é o ecossistema". Em outro thread, o Guilherme Silveira já tinha alertado: "O pessoal achando que desalinhamento é algo do futuro. É super presente."

---

**Terça. Migração silenciosa pro Codex.** O Marcell começou a semana relutando: "tá horrível mesmo :/ mas n tenho coragem de ir pro codex 🥲". O Carraro já tinha mudado: "Pra programar tô usando o Codex. Tô literalmente com 6 janelas de VS Code abertas, cada uma com um projeto, todas com o codex. E ele tá aguentando". Sérgio Lopes endossou em quatro palavras: "Codex tá bem bom vale testar". Paulo confirmou em cinco: "beeeem bom o codex". Não foi um anúncio, foi um drift.

**Paperclip também tá no radar.** Sérgio e Marcell testaram pra orquestração de agentes. O Marcell gostou da interface: "ele deixa vc criar issues, goals, os agentes vao pegando as issues e fazendo. parece um pouco o fluxo que ta montando pra lumina no github". O esforço, segundo ele, "está em deixar .md pra cada agente que vc cria… dai vai um tempo". Sérgio começou a especular: "pensando se nao poderia ser o RalphGui".

**Skills vs plain vanilla, round N.** O Paulo: "Eu tô numa de evitar skill. E ir no plain vanilla em tudo pra dominar melhor essas coisas". O Marcell, do lado oposto: "tô usando além de shaping as skills do garry tan e tem sido incrível pra momentos de planejamento". O grupo dividiu sem discutir. Talvez seja o tipo de decisão que cada um precisa errar sozinho.

---

**Segunda. EmDash, Astro, e a tese do Paulo sobre o sucessor do WordPress.** "O Cloudflare e time do Astro criou um 'sucessor' do Wordpress", escreveu o Paulo no Telegram. "Wordpress roda em 40% dos sites do mundo, mas foi desenhado para um universo tech de décadas atrás." O EmDash foi "feito em 2 meses, vibecodado, para um mundo serverless, edge, lambda e afins". Argumento aberto: "tenho usado muito Astro (o Hipsters Builders tá em Astro! o paulo.com.br tá em Astro! o site da alun.com.br também!) e aposto que vai ter bastante espaço". No Clauders, o mesmo Paulo foi mais lacônico: "astro e tauri vao comer tudo". O Guilherme respondeu: "solves security. ate vc deployar seu source code junto hehe". Ninguém defendeu.

**No mesmo dia, a polêmica do RSA 2026.** O Rafael Ribeiro compartilhou o relatório da vibecoded.vc analisando "o quanto uma empresa poderia ser substituída por um fim de semana de vibe coding". O exemplo escolhido foi recriar o 1Password "com um prompt, principalmente se tratando de segurança". O Paulo notou na hora: "Legal eh q da pra ver que os comentários sobre cada uma são claramente de uma llm". Sérgio Lopes em duas palavras: "Balela demais né". Fim da discussão.

---

E pra fechar a semana, uma curiosidade meta. O sistema que escreve essa newsletter foi montado depois que o Karpathy publicou um Gist sobre wiki + LLM. O Paulo escreveu sobre isso no Telegram: "inclusive para criar essa newsletter do hipsters builders (nesse exato instante foi usado esse mecanismo para produzir o texto)". É auto-referência total, e está tudo bem.

---

*Esta foi a primeira edição. Se você quer ver mais isso, menos isso, ou algo diferente, responde esse email. A gente lê.*

*Paulo e Vinny — Hipsters Builders.*
