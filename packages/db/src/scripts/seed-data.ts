import type { Role } from '@ledgerhand/domain'

/**
 * The demo data. Realistic enough that the reports have shape, the stock alerts
 * fire, and the agent has something worth reasoning about -- an empty database
 * makes every screenshot and every eval scenario meaningless.
 */

export interface SeedProduct {
  readonly sku: string
  readonly name: string
  readonly unit: 'unit' | 'box' | 'pack' | 'kg' | 'g' | 'l' | 'ml' | 'm'
  readonly cost: number
  readonly margin: number
  readonly minimumStock: number
  readonly openingStock: number
}

export interface SeedParty {
  readonly name: string
  readonly taxId: string
  readonly email: string
  readonly paymentTermDays: number
}

export interface SeedUser {
  readonly email: string
  readonly name: string
  readonly role: Role
}

export const SEED_USERS: readonly SeedUser[] = [
  { email: 'admin@ledgerhand.dev', name: 'Ana Ribeiro', role: 'admin' },
  { email: 'sales@ledgerhand.dev', name: 'Bruno Carvalho', role: 'sales' },
  { email: 'finance@ledgerhand.dev', name: 'Carla Domingues', role: 'finance' },
  { email: 'stock@ledgerhand.dev', name: 'Diego Estevam', role: 'stock' },
  { email: 'readonly@ledgerhand.dev', name: 'Elena Fontes', role: 'readonly' },
]

export const SEED_SUPPLIERS: readonly SeedParty[] = [
  {
    name: 'Metalurgica Sao Bento',
    taxId: '11.222.333/0001-44',
    email: 'vendas@saobento.com.br',
    paymentTermDays: 28,
  },
  {
    name: 'Plasticos Iguacu',
    taxId: '22.333.444/0001-55',
    email: 'comercial@iguacu.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Ferramentas Atlas',
    taxId: '33.444.555/0001-66',
    email: 'atendimento@atlas.com.br',
    paymentTermDays: 21,
  },
  {
    name: 'Eletro Componentes RS',
    taxId: '44.555.666/0001-77',
    email: 'pedidos@eletrors.com.br',
    paymentTermDays: 45,
  },
  {
    name: 'Embalagens Norte',
    taxId: '55.666.777/0001-88',
    email: 'contato@embnorte.com.br',
    paymentTermDays: 15,
  },
  {
    name: 'Quimica Vale Verde',
    taxId: '66.777.888/0001-99',
    email: 'vendas@valeverde.com.br',
    paymentTermDays: 35,
  },
]

export const SEED_CUSTOMERS: readonly SeedParty[] = [
  {
    name: 'Construtora Horizonte',
    taxId: '77.888.999/0001-11',
    email: 'compras@horizonte.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Oficina Central',
    taxId: '88.999.111/0001-22',
    email: 'financeiro@oficinacentral.com.br',
    paymentTermDays: 15,
  },
  {
    name: 'Mercado Bom Preco',
    taxId: '99.111.222/0001-33',
    email: 'compras@bompreco.com.br',
    paymentTermDays: 21,
  },
  {
    name: 'Instaladora Luz Viva',
    taxId: '10.222.333/0001-44',
    email: 'contato@luzviva.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Marcenaria Tres Rios',
    taxId: '20.333.444/0001-55',
    email: 'admin@tresrios.com.br',
    paymentTermDays: 45,
  },
  {
    name: 'Refrigeracao Polar',
    taxId: '30.444.555/0001-66',
    email: 'compras@polar.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Hidraulica Sao Jorge',
    taxId: '40.555.666/0001-77',
    email: 'pedidos@saojorge.com.br',
    paymentTermDays: 20,
  },
  {
    name: 'Predial Servicos',
    taxId: '50.666.777/0001-88',
    email: 'financeiro@predial.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Auto Pecas Veloz',
    taxId: '60.777.888/0001-99',
    email: 'compras@veloz.com.br',
    paymentTermDays: 14,
  },
  {
    name: 'Camping Serra Azul',
    taxId: '70.888.999/0001-10',
    email: 'contato@serraazul.com.br',
    paymentTermDays: 30,
  },
  {
    name: 'Cooperativa Agro Sul',
    taxId: '80.999.100/0001-21',
    email: 'compras@agrosul.coop.br',
    paymentTermDays: 60,
  },
  {
    name: 'Manutencao Predial RJ',
    taxId: '90.100.200/0001-32',
    email: 'financeiro@mprj.com.br',
    paymentTermDays: 30,
  },
]

/** Forty products across five families, with plausible costs and margins. */
export const SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    sku: 'FER-1001',
    name: 'Chave de fenda 6mm',
    unit: 'unit',
    cost: 8.4,
    margin: 0.62,
    minimumStock: 40,
    openingStock: 120,
  },
  {
    sku: 'FER-1002',
    name: 'Chave de fenda 8mm',
    unit: 'unit',
    cost: 9.1,
    margin: 0.6,
    minimumStock: 40,
    openingStock: 95,
  },
  {
    sku: 'FER-1003',
    name: 'Chave inglesa 10"',
    unit: 'unit',
    cost: 34.5,
    margin: 0.55,
    minimumStock: 15,
    openingStock: 40,
  },
  {
    sku: 'FER-1004',
    name: 'Martelo unha 27mm',
    unit: 'unit',
    cost: 27.9,
    margin: 0.58,
    minimumStock: 20,
    openingStock: 60,
  },
  {
    sku: 'FER-1005',
    name: 'Alicate universal 8"',
    unit: 'unit',
    cost: 22.3,
    margin: 0.6,
    minimumStock: 25,
    openingStock: 70,
  },
  {
    sku: 'FER-1006',
    name: 'Trena 5m',
    unit: 'unit',
    cost: 14.8,
    margin: 0.65,
    minimumStock: 30,
    openingStock: 85,
  },
  {
    sku: 'FER-1007',
    name: 'Serrote 20"',
    unit: 'unit',
    cost: 31.2,
    margin: 0.52,
    minimumStock: 12,
    openingStock: 28,
  },
  {
    sku: 'FER-1008',
    name: 'Nivel de bolha 40cm',
    unit: 'unit',
    cost: 19.6,
    margin: 0.57,
    minimumStock: 18,
    openingStock: 44,
  },

  {
    sku: 'ELE-2001',
    name: 'Cabo flexivel 2,5mm',
    unit: 'm',
    cost: 2.35,
    margin: 0.48,
    minimumStock: 500,
    openingStock: 1800,
  },
  {
    sku: 'ELE-2002',
    name: 'Cabo flexivel 4mm',
    unit: 'm',
    cost: 3.7,
    margin: 0.46,
    minimumStock: 400,
    openingStock: 1200,
  },
  {
    sku: 'ELE-2003',
    name: 'Disjuntor 20A',
    unit: 'unit',
    cost: 16.4,
    margin: 0.55,
    minimumStock: 50,
    openingStock: 160,
  },
  {
    sku: 'ELE-2004',
    name: 'Disjuntor 32A',
    unit: 'unit',
    cost: 19.8,
    margin: 0.54,
    minimumStock: 40,
    openingStock: 110,
  },
  {
    sku: 'ELE-2005',
    name: 'Tomada 2P+T 10A',
    unit: 'unit',
    cost: 6.9,
    margin: 0.7,
    minimumStock: 80,
    openingStock: 240,
  },
  {
    sku: 'ELE-2006',
    name: 'Interruptor simples',
    unit: 'unit',
    cost: 5.4,
    margin: 0.72,
    minimumStock: 80,
    openingStock: 260,
  },
  {
    sku: 'ELE-2007',
    name: 'Fita isolante 20m',
    unit: 'unit',
    cost: 4.2,
    margin: 0.8,
    minimumStock: 100,
    openingStock: 300,
  },
  {
    sku: 'ELE-2008',
    name: 'Lampada LED 9W',
    unit: 'unit',
    cost: 7.8,
    margin: 0.68,
    minimumStock: 120,
    openingStock: 380,
  },
  {
    sku: 'ELE-2009',
    name: 'Refletor LED 50W',
    unit: 'unit',
    cost: 48.9,
    margin: 0.5,
    minimumStock: 15,
    openingStock: 36,
  },
  {
    sku: 'ELE-2010',
    name: 'Conduite corrugado 25mm',
    unit: 'm',
    cost: 1.85,
    margin: 0.6,
    minimumStock: 600,
    openingStock: 1500,
  },

  {
    sku: 'HID-3001',
    name: 'Tubo PVC 25mm',
    unit: 'm',
    cost: 5.6,
    margin: 0.5,
    minimumStock: 300,
    openingStock: 900,
  },
  {
    sku: 'HID-3002',
    name: 'Tubo PVC 50mm',
    unit: 'm',
    cost: 11.4,
    margin: 0.48,
    minimumStock: 200,
    openingStock: 520,
  },
  {
    sku: 'HID-3003',
    name: 'Joelho 90 25mm',
    unit: 'unit',
    cost: 1.95,
    margin: 0.75,
    minimumStock: 200,
    openingStock: 640,
  },
  {
    sku: 'HID-3004',
    name: 'Luva soldavel 25mm',
    unit: 'unit',
    cost: 1.6,
    margin: 0.78,
    minimumStock: 200,
    openingStock: 700,
  },
  {
    sku: 'HID-3005',
    name: 'Registro esfera 25mm',
    unit: 'unit',
    cost: 24.7,
    margin: 0.52,
    minimumStock: 30,
    openingStock: 78,
  },
  {
    sku: 'HID-3006',
    name: 'Torneira metal 1/2"',
    unit: 'unit',
    cost: 38.4,
    margin: 0.5,
    minimumStock: 20,
    openingStock: 46,
  },
  {
    sku: 'HID-3007',
    name: 'Veda rosca 18m',
    unit: 'unit',
    cost: 3.1,
    margin: 0.85,
    minimumStock: 120,
    openingStock: 340,
  },
  {
    sku: 'HID-3008',
    name: 'Caixa dagua 500L',
    unit: 'unit',
    cost: 289.0,
    margin: 0.35,
    minimumStock: 5,
    openingStock: 12,
  },

  {
    sku: 'QUI-4001',
    name: 'Tinta acrilica branca 18L',
    unit: 'unit',
    cost: 189.0,
    margin: 0.4,
    minimumStock: 8,
    openingStock: 22,
  },
  {
    sku: 'QUI-4002',
    name: 'Tinta acrilica cinza 3,6L',
    unit: 'unit',
    cost: 52.0,
    margin: 0.45,
    minimumStock: 15,
    openingStock: 40,
  },
  {
    sku: 'QUI-4003',
    name: 'Massa corrida 25kg',
    unit: 'unit',
    cost: 68.5,
    margin: 0.38,
    minimumStock: 10,
    openingStock: 26,
  },
  {
    sku: 'QUI-4004',
    name: 'Solvente 5L',
    unit: 'unit',
    cost: 42.3,
    margin: 0.42,
    minimumStock: 12,
    openingStock: 30,
  },
  {
    sku: 'QUI-4005',
    name: 'Silicone incolor 280g',
    unit: 'unit',
    cost: 14.9,
    margin: 0.6,
    minimumStock: 40,
    openingStock: 110,
  },
  {
    sku: 'QUI-4006',
    name: 'Adesivo PVC 175g',
    unit: 'unit',
    cost: 9.7,
    margin: 0.65,
    minimumStock: 50,
    openingStock: 140,
  },
  {
    sku: 'QUI-4007',
    name: 'Desengraxante 1L',
    unit: 'l',
    cost: 18.2,
    margin: 0.55,
    minimumStock: 25,
    openingStock: 62,
  },

  {
    sku: 'EMB-5001',
    name: 'Caixa papelao 40x30x25',
    unit: 'unit',
    cost: 3.4,
    margin: 0.55,
    minimumStock: 150,
    openingStock: 420,
  },
  {
    sku: 'EMB-5002',
    name: 'Fita adesiva 48mm',
    unit: 'unit',
    cost: 5.9,
    margin: 0.62,
    minimumStock: 100,
    openingStock: 280,
  },
  {
    sku: 'EMB-5003',
    name: 'Plastico bolha 60cm',
    unit: 'm',
    cost: 1.25,
    margin: 0.7,
    minimumStock: 400,
    openingStock: 1100,
  },
  {
    sku: 'EMB-5004',
    name: 'Saco plastico 30x40',
    unit: 'pack',
    cost: 12.8,
    margin: 0.58,
    minimumStock: 60,
    openingStock: 150,
  },
  {
    sku: 'EMB-5005',
    name: 'Palete madeira 1,2m',
    unit: 'unit',
    cost: 74.0,
    margin: 0.3,
    minimumStock: 10,
    openingStock: 24,
  },
  {
    sku: 'EMB-5006',
    name: 'Filme stretch 500mm',
    unit: 'unit',
    cost: 46.5,
    margin: 0.45,
    minimumStock: 15,
    openingStock: 38,
  },
  {
    sku: 'EMB-5007',
    name: 'Etiqueta termica 100x50',
    unit: 'pack',
    cost: 28.9,
    margin: 0.5,
    minimumStock: 20,
    openingStock: 55,
  },
]

/**
 * Which supplier stocks which product family, so replenishment has a sensible
 * answer and the "buy from the cheapest supplier" eval has something to weigh.
 */
export const SUPPLIER_FOR_PREFIX: Readonly<Record<string, number>> = {
  FER: 2,
  ELE: 3,
  HID: 1,
  QUI: 5,
  EMB: 4,
}
