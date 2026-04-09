# Hipsters Builders nº 1
*A primeira edição. 30 de março a 7 de abril de 2026.*

> "Wtf. 1bi commits em 2025 e agora é 1bi commits por mes!?
> E isso que 90% do mundo não acordou ainda pro Claude code."
> — Sérgio Lopes, sexta de manhã.

Toda semana a gente vai cobrir o que rolou nos canais Hipsters Builders (Telegram), Clauders (WhatsApp) e IA Sob Controle. Em cada bloco, dois ângulos: a versão **editorial**, e a versão **do grupo** — essa é literalmente as mensagens que rolaram.

---

## 1. A Anthropic está com pressa

**Editorial.** A semana foi de anúncios sem entrega. O Claude Mythos veio com vídeo do CEO, system card completo, benchmarks novos e nenhum modelo público. Logo depois, o Project Glasswing reivindicou capacidade de encontrar zero-days em SOs e browsers — também sem ferramenta acessível. E pra fechar o tridente, a notícia de que assinantes do Claude vão perder acesso em apps third-party como OpenClaw a partir de 4 de abril, "para gerenciar melhor a capacidade". Três movimentos simultâneos que parecem uma coisa só: a Anthropic precisa fazer barulho técnico enquanto aperta a porta comercial. Tudo isso "bem pertinho do IPO", como o Paulo lembrou no Clauders.

**No grupo.**

> **Marcell Almeida:** esse papo de não disponibilizar o modelo, lançar esse projeto com vídeo do CEO etc etc me cheira a marketing stunt
>
> **Fabrício Carraro:** Sim, com certeza é. Mas a questão de terem liberado os benchmarks e o system card completíssimo, mostra que não é só marketing
>
> **Marcell Almeida:** se duvidar vão inventar um jeito de disponibilizar o mythos
>
> **Paulo Silveira:** onde poe o cartao de credito meldels. eu JURO que nao vou hackar ninguem
>
> **Guilherme Silveira** *(sobre o Glasswing)***:** Ufa. Que bom que as empresas americanas estão com essas armas na mão e vão defender o mundo.
>
> **Paulo Silveira:** Vão hackear nossas apps privadamente kkk
>
> **Fabrício Carraro** *(sobre as restrições do third-party)***:** Estão sangrando MESMO

---

## 2. "Todo mundo com github verdinho mas comitando onde nao precisa"

**Editorial.** Rafael Ribeiro abriu uma discussão sobre como medir produtividade quando a IA infla o volume de commits sem necessariamente inflar valor. A hipótese é simples: as métricas tradicionais (DORA inclusive, mesmo adaptado) capturam volume, não substância. Em paralelo, no canal do Telegram, Paulo escreveu um post longo sobre como a codificação agêntica aumenta a "superfície de bugs" do software. Os exemplos do mercado fazem barulho: Daniel Stenberg desligou o bug bounty do cURL depois que 20% das submissões viraram IA, Mitchell Hashimoto baniu código gerado de IA do Ghostty, e Steve Ruiz fechou todos os PRs externos do tldraw. A tese do Paulo: as vantagens existem para quem tem domínio técnico, mas "quando falta domínio técnico, quem paga a conta é o ecossistema".

**No grupo.**

> **Rafael Ribeiro:** Provavelmente tem haver com o volume de entregas e a falsa sensação de progresso que isso gera. Sem processo bem definido gera mto débito técnico
>
> **Paulo Silveira:** todo mundo com github verdinho mas comitando onde nao precisa
>
> **Mauricio Aniche:** AI também deixa a pessoa explorar mais, ela abre PR e depois descarta.
>
> **Mauricio Aniche** *(em paralelo, sobre Jason Gorman e TDD)***:** ele é um dos apaixonados por TDD, como se nao houvesse outra maneira de fazer software sem isso. Está pirando no mundo novo. (...) bem gente boa, mas religioso demais quando se trata de engenharia de software. Da mesma escola do Dave Farley.

E em outro thread, ainda sobre o mesmo tema, o Guilherme Silveira foi mais técnico:

> **Guilherme Silveira:** O pessoal achando que desalinhamento é algo do futuro. É super presente. (...) Tem casos piores tá. Onde ele faz um git log, vai lá atrás ver o que aconteceu e ao invés de fazer um cherry pick dá um rollback de um monte de coisa junto pra tentar quebrar o guardrail.

---

## 3. Migração silenciosa pro Codex

**Editorial.** Em algum momento da semana, o grupo todo migrou de ferramenta sem que houvesse anúncio. Começou com o Carraro batendo no limite do Claude no início do dia ("Seu limite acabou até sábado às Xhs"), passou pro Sérgio confirmando que o Codex tá maduro, terminou com o Carraro rodando seis janelas paralelas no plano enterprise da Alura. Em paralelo, Sérgio e Marcell testavam Paperclip pra orquestração de agentes. E o Paulo, no movimento contrário, anunciou que tá indo pro plain vanilla pra dominar melhor as ferramentas. O grupo não chegou a uma conclusão e ninguém parece esperar que chegue.

**No grupo.**

> **Marcell Almeida:** tá horrível mesmo :/ mas n tenho coragem de ir pro codex 🥲
>
> **Fabrício Carraro:** Usei 1x hoje de manhã, apareceu a mensagem "Seu limite acabou até sábado às Xhs". Pra programar tô usando o Codex
>
> **Sérgio Lopes:** Codex tá bem bom vale testar
>
> **Paulo Silveira:** beeeem bom o codex
>
> **Fabrício Carraro:** Tô literalmente com 6 janelas de VS Code abertas, cada uma com um projeto, todas com o codex. E ele tá aguentando
>
> **Paulo Silveira** *(sobre o paperclip e skills em geral)***:** Eu tô numa de evitar skill. E ir no plain vanilla em tudo pra dominar melhor essas coisas
>
> **Marcell Almeida:** tô usando além de shaping as skills do garry tan e tem sido incrível pra momentos de planejamento - seja feature grande ou pequena

---

## 4. EmDash, Astro, e o sucessor do WordPress

**Editorial.** Cloudflare e o time do Astro lançaram o EmDash, posicionando como "sucessor espiritual do WordPress". Paulo trouxe o argumento principal pro Telegram: WordPress roda em 40% dos sites do mundo mas foi desenhado pra um universo tech de décadas atrás (plugins, hosting, pagamentos), e o EmDash foi "feito em 2 meses, vibecodado, para um mundo serverless, edge, lambda e afins". Stack moderna, build em duas semanas, tese plausível.

**No grupo.**

> **Paulo Silveira:** astro e tauri vao comer tudo
>
> **Guilherme Silveira:** solves security. ate vc deployar seu source code junto hehe

Sem defesa.

---

## A mensagem que ninguém respondeu

Toda semana a gente vai destacar uma pergunta ou observação que ficou sem resposta no grupo. Essa edição:

> **Paulo Silveira** *(no Clauders, quarta)***:** só que a galera vai mandar ele fazer, nao vai pedir pra ele guair ou explicar
>
> **Marcell Almeida:** heheheh, verdade.

A discussão era sobre o futuro da educação com IA. A hipótese do Paulo: o problema da IA na educação não é que ela não consegue ensinar, é que ninguém vai pedir pra ela explicar — vão pedir pra ela fazer. O Marcell concordou. Ninguém mais respondeu.

**Se você tem opinião sobre isso, responde esse email — a gente abre espaço pra resposta na próxima edição.**

---

*Paulo e Vinny — Hipsters Builders.*

*Pra quem se perguntou: essa newsletter foi montada com um sistema baseado no Gist que o Karpathy publicou semana passada (wiki + LLM pra ingerir e processar). O Paulo escreveu sobre isso no Telegram: "inclusive para criar essa newsletter do hipsters builders (nesse exato instante foi usado esse mecanismo para produzir o texto)". É meta total e está tudo bem.*
