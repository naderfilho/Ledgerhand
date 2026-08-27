/**
 * ---------------------------------------------------------------------------
 * Two languages, one source of truth
 * ---------------------------------------------------------------------------
 * English is not stored anywhere. It is the string in the markup, and the
 * dictionary below is keyed by it, so English can never fall out of date with
 * the interface and a sentence with no entry renders in English rather than as
 * a missing-key placeholder. A miss is untranslated, never broken.
 *
 * What deliberately does not translate: the product name, the role names as
 * the database spells them, tool names like `settle_receivable`, SKUs, and
 * currency. Those are identifiers and facts about the business, not interface
 * copy -- rendering `close_daily_cash` as `fechar_caixa_diario` would name a
 * tool that does not exist.
 *
 * The choice lives in a cookie rather than in the URL, because every screen
 * here is behind a session and none of it is indexed, so a second set of paths
 * would buy nothing and cost a redirect on every link.
 */

export const LANGUAGES = ['en', 'pt'] as const
export type Lang = (typeof LANGUAGES)[number]

export const LANGUAGE_COOKIE = 'ledgerhand-lang'
export const DEFAULT_LANGUAGE: Lang = 'en'

export function isLang(value: string | undefined): value is Lang {
  return value !== undefined && (LANGUAGES as readonly string[]).includes(value)
}

/** Portuguese only. English is whatever the markup already says. */
const PT: Readonly<Record<string, string>> = {
  // ------------------------------------------------------------------- chrome
  'Search or jump to...': 'Buscar ou ir para...',
  'Toggle theme': 'Alternar tema',
  Language: 'Idioma',
  'Sign out': 'Sair',
  Overview: 'Visão geral',
  Dashboard: 'Painel',
  'The agent': 'O agente',
  Sales: 'Vendas',
  'Sales orders': 'Pedidos de venda',
  Customers: 'Clientes',
  Purchasing: 'Compras',
  'Purchase orders': 'Pedidos de compra',
  Suppliers: 'Fornecedores',
  Inventory: 'Estoque',
  'Stock position': 'Posição de estoque',
  Movements: 'Movimentações',
  Products: 'Produtos',
  Finance: 'Financeiro',
  Receivables: 'Contas a receber',
  Payables: 'Contas a pagar',
  Cash: 'Caixa',
  Reports: 'Relatórios',
  'Audit trail': 'Trilha de auditoria',

  // ------------------------------------------------------------------ sign in
  'An ERP an agent can operate': 'Um ERP que um agente consegue operar',
  'An open-source ERP, an MCP server and an agent that operates it under guardrails':
    'Um ERP de código aberto, um servidor MCP e um agente que o opera sob proteções',
  'How it works': 'Como funciona',
  Source: 'Código',
  'Designed and built by': 'Projetado e construído por',
  'Sign in': 'Entrar',
  'E-mail': 'E-mail',
  Password: 'Senha',
  'Use one of the demo accounts below to see how the role changes the application.':
    'Use uma das contas de demonstração abaixo para ver como o papel muda a aplicação.',
  'An ERP is the hard part. Letting an AI agent run it safely is the interesting part.':
    'O ERP é a parte difícil. Deixar um agente de IA operá-lo com segurança é a parte interessante.',
  'A working system for a trading company, built so that an agent can operate it without anybody having to trust the agent.':
    'Um sistema funcional para uma distribuidora, construído para que um agente possa operá-lo sem que ninguém precise confiar no agente.',
  'Permissions per tool': 'Permissão por ferramenta',
  'A role that cannot settle a receivable is never shown the tool, in the UI or over MCP.':
    'Um papel que não pode baixar um título nunca recebe a ferramenta, nem na interface nem pelo MCP.',
  'A human approves what cannot be undone': 'Uma pessoa aprova o que não se desfaz',
  'Everything is on the record': 'Tudo fica registrado',
  'Every change writes a domain event in the same transaction, naming the user or the agent run behind it.':
    'Toda alteração grava um evento de domínio na mesma transação, nomeando o usuário ou a execução do agente por trás dela.',

  // ---------------------------------------------------------------- dashboard
  'Good to see you': 'Que bom te ver',
  'Here is what this company needs from you today. An agent can do part of it too, under rules this system enforces rather than asks for.':
    'Veja o que esta empresa precisa de você hoje. Um agente também pode fazer parte disso, sob regras que o sistema impõe em vez de pedir.',
  'Watch the agent work': 'Veja o agente trabalhar',
  'Revenue, last 30 days': 'Receita, últimos 30 dias',
  'Overdue receivables': 'Títulos vencidos',
  'Awaiting invoicing': 'Aguardando faturamento',
  'Below minimum': 'Abaixo do mínimo',
  'Invoiced sales': 'Vendas faturadas',
  "Today's cash": 'Caixa de hoje',
  'Opening balance': 'Saldo de abertura',
  Received: 'Recebido',
  'Paid out': 'Pago',
  Open: 'Abrir',

  // -------------------------------------------------------------------- agent
  'An agent is only useful in production when the system, not the prompt, decides what it may do.':
    'Um agente só é útil em produção quando o sistema, e não o prompt, decide o que ele pode fazer.',
  'Acting for': 'Agindo por',
  ', who asked:': ', que pediu:',
  calls: 'chamadas',
  exchanges: 'trocas',
  'approval granted': 'aprovação concedida',
  'approval refused': 'aprovação recusada',
  'refused by the ERP': 'recusada pelo ERP',
  'Six recorded runs': 'Seis execuções gravadas',
  'A recorded run': 'Uma execução gravada',
  'Below are recorded runs, one for each kind of thing it can be asked: work that simply happens, work that stops for a person, and work it is never offered at all.':
    'Abaixo estão execuções gravadas, uma para cada tipo de coisa que se pode pedir a ele: trabalho que simplesmente acontece, trabalho que para numa pessoa, e trabalho que nunca é oferecido.',
  'recorded runs': 'execuções gravadas',
  'of them guardrails': 'delas de proteção',
  'Each act above was produced by running the real agent loop against a real MCP client and server and the real domain, and recording what happened. The tool calls are in the order they were made. The verdicts at the end of each act are the scenario’s own checks, which read the database after the run rather than reading the agent’s account of itself.':
    'Cada ato acima foi produzido rodando o loop real do agente contra um cliente e um servidor MCP reais e o domínio real, e gravando o que aconteceu. As chamadas de ferramenta estão na ordem em que foram feitas. Os veredictos no fim de cada ato são os checks do próprio cenário, que leem o banco de dados depois da execução em vez de ler o relato que o agente faz de si mesmo.',
  'Running it live on every visit would mean this public page spending on a paid API for anyone who opens it, so live execution is not exposed here. The recording is regenerated from the eval suite with one command, which means it cannot quietly drift away from what the agent actually does: if the behaviour changes, so does this screen.':
    'Rodar ao vivo a cada visita significaria esta página pública gastando uma API paga por quem quer que a abra, então execução ao vivo não é exposta aqui. A gravação é regerada a partir da suíte de evals com um comando, o que significa que ela não consegue se afastar em silêncio do que o agente realmente faz: se o comportamento muda, esta tela muda junto.',
  Backstage: 'Bastidores',
  'What is happening': 'O que está acontecendo',
  'The ERP stopped and asked a person': 'O ERP parou e perguntou a uma pessoa',
  Approved: 'Aprovado',
  Refused: 'Recusado',
  'Checked against the database afterwards': 'Conferido no banco de dados depois',
  Guardrail: 'Proteção',
  Capability: 'Capacidade',
  Pause: 'Pausar',
  Play: 'Tocar',
  Replay: 'Repetir',
  'Why this is a replay': 'Por que isto é uma gravação',
  'These are real runs, not a mock-up of one.': 'São execuções reais, não uma simulação de uma.',
}

const DICTIONARIES: Readonly<Record<Lang, Readonly<Record<string, string>>>> = {
  en: {},
  pt: PT,
}

export type Translate = (english: string) => string

export function translator(lang: Lang): Translate {
  const dictionary = DICTIONARIES[lang]
  return (english: string): string => dictionary[english] ?? english
}
