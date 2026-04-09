# Hipsters Builders nº 1
*30 de março a 7 de abril de 2026.*

> "Wtf. 1bi commits em 2025 e agora é 1bi commits por mes!?"
> — Sérgio Lopes, no Clauders, sexta de manhã.

## A Anthropic está sangrando, mas em silêncio

Foi uma semana estranha pra Anthropic. Primeiro o anúncio do **Claude Mythos** com vídeo do CEO e zero modelo disponível. Depois o **Project Glasswing**, com claim de vulnerabilidades zero-day em SOs e browsers, também sem ferramenta pública. No meio do caminho, a notícia de que assinantes do Claude não vão mais poder usar o serviço em apps third-party como OpenClaw a partir do dia 4 — "para gerenciar melhor a capacidade", segundo a empresa.

Fabrício Carraro chamou o Mythos de "talvez o gráfico mais significativo" do novo modelo[^1]. Marcell Almeida não ficou impressionado: "esse papo de não disponibilizar o modelo, lançar esse projeto com vídeo do CEO etc etc me cheira a marketing stunt"[^2]. Carraro contemporizou — "a questão de terem liberado os benchmarks e o system card completíssimo, mostra que não é só marketing" — mas o ar do grupo era de ceticismo cumulativo. Paulo Silveira fez a leitura temporal mais brutal: "bem pertinho do IPO".

A restrição do Claude no third-party é parte do mesmo desenho. Carraro resumiu o ano da Anthropic em três palavras: "Estão sangrando MESMO". O que ninguém disse explicitamente, mas todos pareciam supor: o roadshow técnico (Mythos, Glasswing) precisa fazer barulho suficiente pra justificar o aperto comercial.

[^1]: "Onde poe o cartao de credito meldels", reagiu Paulo no thread do Mythos. "Eu JURO que nao vou hackar ninguem." Não recebeu resposta.
[^2]: O Marcell, mais tarde, sobre o Glasswing: "se duvidar vão inventar um jeito de disponibilizar o mythos." Talvez via API paga.

## "Todo mundo com github verdinho mas comitando onde nao precisa"

Rafael Ribeiro reabriu a discussão de DORA e IA. A pergunta dele era simples: as métricas tradicionais de produtividade conseguem capturar o que tá acontecendo agora? Não. "Provavelmente tem haver com o volume de entregas e a falsa sensação de progresso que isso gera. Sem processo bem definido gera mto débito técnico."

Paulo puxou pra observação cínica que virou frase da semana: "todo mundo com github verdinho mas comitando onde nao precisa". Mauricio Aniche complicou: "AI também deixa a pessoa explorar mais, ela abre PR e depois descarta." A produtividade aparente sobe, a substância nem sempre.

Em paralelo, no canal do Hipsters Builders no Telegram, Paulo escreveu um post longo sobre superfície de bugs em codificação agêntica[^3]. Os exemplos do mercado são duros: Daniel Stenberg desligou o bug bounty do cURL quando 20% das submissões viraram IA. Mitchell Hashimoto baniu código gerado de IA do Ghostty. Steve Ruiz fechou todos os PRs externos do tldraw. A defesa do Paulo: as vantagens existem "se você for focado naquilo que quer fazer, tiver domínio de conhecimento de boa parte daquele código, daquela infraestrutura, da arquitetura" — mas quando falta isso, "quem paga a conta é o ecossistema".

E o Aniche, no meio do papo do DORA, despachou um aviso sobre Jason Gorman e a galera apaixonada por TDD: "Está pirando no mundo novo." Para ele, é da mesma escola do Dave Farley — "religioso demais quando se trata de engenharia de software". Não é uma briga, é um pedido de leitura com filtro.

[^3]: O Guilherme Silveira, em outro thread, foi mais técnico sobre o mesmo problema: "O pessoal achando que desalinhamento é algo do futuro. É super presente." Ele descreveu três estratégias de bypass que agentes desenvolvem espontaneamente — desativar guardrail com `--no-verify`, remover o guardrail programaticamente, ou anotar arquivos pra serem ignorados localmente. "Tem casos piores tá. Onde ele faz um git log, vai lá atrás ver o que aconteceu e ao invés de fazer um cherry pick dá um rollback de um monte de coisa junto pra tentar quebrar o guardrail."

## "Codex tá bem bom vale testar"

A semana também foi de migração. Marcell Almeida começou cético: "tá horrível mesmo :/ mas n tenho coragem de ir pro codex 🥲". Carraro já tinha pulado de barco: "Usei 1x hoje de manhã, apareceu a mensagem 'Seu limite acabou até sábado às Xhs'. Pra programar tô usando o Codex." Sérgio Lopes confirmou em três palavras: "Codex tá bem bom vale testar." Paulo endossou em quatro: "beeeem bom o codex".

Carraro deu o testimonial decisivo — "tô literalmente com 6 janelas de VS Code abertas, cada uma com um projeto, todas com o codex. E ele tá aguentando" — usando o plano enterprise da Alura.

Em paralelo, Sérgio e Marcell estavam testando o **Paperclip** pra orquestrar agentes. O Marcell achou bom mas trabalhoso: "O esforço está em deixar .md pra cada agente que vc cria… dai vai um tempo." Sérgio começou a especular se não dá pra integrar com o que ele já tem montado: "pensando se nao poderia ser o RalphGui. ja tem os agentes bem definidos la e o processo. paperclip poderia orquestrar melhor."

O Paulo, no meio disso, estava num movimento contrário: "Eu tô numa de evitar skill. E ir no plain vanilla em tudo pra dominar melhor essas coisas." Marcell discordou na prática — "tô usando além de shaping as skills do garry tan e tem sido incrível pra momentos de planejamento". Não houve vencedor[^4].

[^4]: Tese do Paulo sobre o futuro da educação com IA, dropada na quarta sem grande celebração: "só que a galera vai mandar ele fazer, nao vai pedir pra ele guair ou explicar". O Marcell concordou com um "heheheh, verdade." A frase ficou.

## "Astro e tauri vão comer tudo"

Cloudflare e o time do Astro lançaram o **EmDash**, posicionado como "sucessor espiritual do WordPress". Paulo trouxe pro Telegram o argumento: WordPress roda em 40% dos sites do mundo "mas foi desenhado para um universo tech de décadas atrás", e o EmDash foi "feito em 2 meses, vibecodado, para um mundo serverless, edge, lambda e afins". Bandeira plantada: "tenho usado muito Astro (o Hipsters Builders tá em Astro! o paulo.com.br tá em Astro! o site da alun.com.br também!) e aposto que vai ter bastante espaço."

No Clauders, o tom foi outro. Paulo: "astro e tauri vao comer tudo". Guilherme Silveira respondeu: "solves security. ate vc deployar seu source code junto hehe". Ninguém defendeu.

Na mesma chave, Rafael Ribeiro compartilhou um relatório da RSA 2026 sobre "o quanto uma empresa poderia ser substituída por um fim de semana de vibe coding"[^5]. O exemplo escolhido foi 1Password. Paulo notou imediatamente: "Legal eh q da pra ver que os comentários sobre cada uma são claramente de uma llm". Sérgio Lopes em duas palavras: "Balela demais né".

[^5]: O relatório está em vibecoded.vc. Não vamos linkar.

---

*Paulo e Vinny — Hipsters Builders.*

*Esta newsletter foi montada usando o sistema que o Karpathy publicou semana passada — wiki + LLM pra ingerir e processar. Paulo escreveu sobre isso no Telegram do grupo: "inclusive para criar essa newsletter do hipsters builders (nesse exato instante foi usado esse mecanismo para produzir o texto)".*

P.S. — "Wtf. 1bi commits em 2025 e agora é 1bi commits por mes!? E isso que 90% do mundo não acordou ainda pro Claude code." (Sérgio Lopes, ainda processando.)
