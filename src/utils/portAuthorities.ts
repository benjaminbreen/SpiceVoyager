export type AuthorityKind =
  | 'crown-office'
  | 'viceroy'
  | 'fort-captain'
  | 'company'
  | 'customs'
  | 'sultanate'
  | 'magistracy'
  | 'local-broker'
  | 'no-state';

export interface PortAuthority {
  portId: string;
  label: string;
  office: string;
  authorityKind: AuthorityKind;
  buildingLabel: string;
  buildingSub: string;
  creditPatron: string;
  commissionStyle: 'state' | 'company' | 'merchant-house' | 'customs' | 'local-barter';
  note: string;
}

// Historical basis: project reference list in AGENTS.md, "1612 Port Authority
// Reference". This table intentionally names the authority a spice trader
// would actually petition, which is not always a governor.
//
// Compact source notes for rows most likely to be challenged:
// - Calicut: Shah Bandar Koya as port commissioner/customs broker under the
//   Zamorin; see the Calicut/Zamorin trade-office summary and bibliography in
//   https://en.wikipedia.org/wiki/Zamorin
// - Macau: Leal Senado as Portuguese Macau's governing municipal institution;
//   see https://en.wikipedia.org/wiki/Leal_Senado_Building
// - Mocha: Red Sea coffee-export port, Ottoman suzerainty, European factories;
//   see https://www.britannica.com/place/Mocha-Yemen
// - Socotra: Mahra rule, interrupted by Portuguese occupation only 1507-1511;
//   see https://www.britannica.com/place/Socotra and
//   https://www.britannica.com/place/Mahra-Sultanate
// - Masulipatnam: Golconda/Qutb Shahi port; Dutch permission in 1605/1606 and
//   EIC station in 1611; see
//   https://kids.britannica.com/students/article/Machilipatnam/328738
// - Nagasaki: bugyo handled port administration/trade oversight; Murayama Toan
//   was Nagasaki daikan until 1619; see
//   https://en.wikipedia.org/wiki/Nagasaki_bugy%C5%8D and
//   https://samurai-archives.com/wiki/Murayama_Toan
// - Cape: no European governor before the Dutch settlement of 1652; current
//   table treats authority as inferred seasonal Khoikhoi barter contacts.
export const PORT_AUTHORITIES: Record<string, PortAuthority> = {
  goa: {
    portId: 'goa',
    label: 'Viceroy of Estado da India',
    office: 'D. Jeronimo de Azevedo, Viceroy from 1612',
    authorityKind: 'viceroy',
    buildingLabel: "Viceroy's Palace",
    buildingSub: 'Estado da India viceregal seat',
    creditPatron: 'Casa da India',
    commissionStyle: 'state',
    note: 'Goa is the Estado da India capital. High-value petitions pass through viceregal officers and the Casa da India customs regime.',
  },
  lisbon: {
    portId: 'lisbon',
    label: 'Casa da India',
    office: 'Crown factors at the Ribeira Palace',
    authorityKind: 'crown-office',
    buildingLabel: 'Casa da India',
    buildingSub: 'royal India trade office',
    creditPatron: 'Casa da India',
    commissionStyle: 'state',
    note: 'Lisbon licenses and accounts for the Carreira da India through crown offices in the Ribeira palace complex.',
  },
  diu: {
    portId: 'diu',
    label: 'Captain of Diu',
    office: 'Portuguese fortress captaincy',
    authorityKind: 'fort-captain',
    buildingLabel: "Captain's Fortress",
    buildingSub: 'Portuguese fortress captaincy',
    creditPatron: 'Diu captaincy factors',
    commissionStyle: 'customs',
    note: 'Diu is a fortress-port. The captaincy and customs officers matter more to a trader than a civilian governor.',
  },
  hormuz: {
    portId: 'hormuz',
    label: 'Captain of Hormuz',
    office: 'Portuguese fortress and customs command',
    authorityKind: 'fort-captain',
    buildingLabel: 'Fortress of Hormuz',
    buildingSub: 'Portuguese customs fortress',
    creditPatron: 'Hormuz customs factors',
    commissionStyle: 'customs',
    note: 'The island remains under Portuguese fortress power in 1612, with customs revenue as the practical lever.',
  },
  muscat: {
    portId: 'muscat',
    label: 'Captain of Muscat',
    office: 'Portuguese command at al-Mirani and al-Jalali',
    authorityKind: 'fort-captain',
    buildingLabel: "Captain's Fort",
    buildingSub: 'Portuguese fort command',
    creditPatron: 'Muscat captaincy brokers',
    commissionStyle: 'customs',
    note: 'Muscat is Portuguese-held, but Omani authority and resentment sit close behind the fort walls.',
  },
  malacca: {
    portId: 'malacca',
    label: 'Captain-major of Malacca',
    office: 'Portuguese command at A Famosa',
    authorityKind: 'fort-captain',
    buildingLabel: 'A Famosa',
    buildingSub: 'Portuguese fortress command',
    creditPatron: 'Malacca fortress factors',
    commissionStyle: 'customs',
    note: 'Malacca is an armed entrepot. The captain-major controls access to official trade and customs.',
  },
  macau: {
    portId: 'macau',
    label: 'Leal Senado',
    office: 'Municipal senate, with the Captain-major of the Japan voyage nearby',
    authorityKind: 'crown-office',
    buildingLabel: 'Leal Senado',
    buildingSub: 'Portuguese municipal senate',
    creditPatron: 'Macau comprador network',
    commissionStyle: 'merchant-house',
    note: 'Macau is a negotiated Portuguese settlement under Ming tolerance, so municipal and merchant authority is more accurate than a colonial governor.',
  },
  mombasa: {
    portId: 'mombasa',
    label: 'Captain of Fort Jesus',
    office: 'Portuguese fortress command',
    authorityKind: 'fort-captain',
    buildingLabel: 'Fort Jesus Captaincy',
    buildingSub: 'Portuguese fortress command',
    creditPatron: 'Fort Jesus factors',
    commissionStyle: 'customs',
    note: 'Fort Jesus dominates the harbor, but Swahili merchants still shape actual coastal trade.',
  },
  elmina: {
    portId: 'elmina',
    label: 'Captain-factor of Sao Jorge da Mina',
    office: 'Portuguese castle factor and captain',
    authorityKind: 'fort-captain',
    buildingLabel: 'Sao Jorge da Mina',
    buildingSub: 'Portuguese castle factory',
    creditPatron: 'Mina castle factor',
    commissionStyle: 'customs',
    note: 'The captain-factor answers to Lisbon and bargains from the castle, while Akan brokers control access inland.',
  },
  luanda: {
    portId: 'luanda',
    label: 'Governor of Angola',
    office: 'Bento Banha Cardoso in 1612',
    authorityKind: 'crown-office',
    buildingLabel: "Governor's Fortress",
    buildingSub: 'Portuguese Angolan government',
    creditPatron: 'Angola governorate factors',
    commissionStyle: 'state',
    note: 'Luanda is a crown colony and military post tied to Angola and Brazil through Portuguese officials.',
  },
  salvador: {
    portId: 'salvador',
    label: 'Governor-General of Brazil',
    office: 'Portuguese colonial capital at Bahia',
    authorityKind: 'crown-office',
    buildingLabel: 'Palacio do Governo',
    buildingSub: 'Brazilian governor-general seat',
    creditPatron: 'Bahia crown factors',
    commissionStyle: 'state',
    note: 'Salvador is the administrative capital of Portuguese Brazil, with sugar and tobacco accounts moving through crown channels.',
  },
  seville: {
    portId: 'seville',
    label: 'Casa de Contratacion',
    office: 'Spanish royal Indies trade house',
    authorityKind: 'crown-office',
    buildingLabel: 'Casa de Contratacion',
    buildingSub: 'royal Indies trade house',
    creditPatron: 'Casa de Contratacion',
    commissionStyle: 'state',
    note: 'Seville is where royal officials register ships, passengers, and cargo for the Indies trade.',
  },
  havana: {
    portId: 'havana',
    label: 'Captain-General of Cuba',
    office: 'Governor and fleet-protection command',
    authorityKind: 'crown-office',
    buildingLabel: "Captain-General's House",
    buildingSub: 'Spanish captaincy general',
    creditPatron: 'Havana treasury officials',
    commissionStyle: 'state',
    note: 'Havana exists as a fleet and provisioning hub, so the captain-general and royal treasury are the relevant authorities.',
  },
  cartagena: {
    portId: 'cartagena',
    label: 'Governor of Cartagena',
    office: 'Governorate and royal customs officers',
    authorityKind: 'crown-office',
    buildingLabel: "Governor's Palace",
    buildingSub: 'Spanish governorate',
    creditPatron: 'Cartagena royal treasury',
    commissionStyle: 'state',
    note: 'Cartagena combines military government, customs, treasury, and the new Inquisition tribunal.',
  },
  manila: {
    portId: 'manila',
    label: 'Governor and Captain-General',
    office: 'Juan de Silva and the Real Audiencia',
    authorityKind: 'crown-office',
    buildingLabel: 'Palacio del Gobernador',
    buildingSub: 'Spanish Philippine government',
    creditPatron: 'Manila royal treasury',
    commissionStyle: 'state',
    note: 'Manila is a Spanish Asian capital, with the governor, audiencia, and galleon accounts shaping trade access.',
  },
  calicut: {
    portId: 'calicut',
    label: 'Shahbandar of Calicut',
    office: 'Koya broker under the Zamorin',
    authorityKind: 'local-broker',
    buildingLabel: "Shahbandar's House",
    buildingSub: "Zamorin's port broker",
    creditPatron: 'Calicut Koya brokers',
    commissionStyle: 'merchant-house',
    note: 'The Zamorin remains sovereign, but a foreign spice trader would usually work through hereditary Muslim brokers and the shahbandar.',
  },
  surat: {
    portId: 'surat',
    label: 'Mutasaddi of Surat',
    office: 'Mughal port governor and customs official',
    authorityKind: 'customs',
    buildingLabel: 'Mughal Custom House',
    buildingSub: 'Mughal port authority',
    creditPatron: 'Surat merchant house',
    commissionStyle: 'merchant-house',
    note: 'Surat trade depends on Mughal customs officers, merchant houses, and permission from the mutasaddi.',
  },
  masulipatnam: {
    portId: 'masulipatnam',
    label: 'Golconda Custom House',
    office: 'Qutb Shahi port officials',
    authorityKind: 'customs',
    buildingLabel: 'Golconda Custom House',
    buildingSub: 'Qutb Shahi port authority',
    creditPatron: 'Masulipatnam brokers',
    commissionStyle: 'merchant-house',
    note: 'The Coromandel port answers to Golconda officials while Dutch and English factories negotiate for space.',
  },
  aden: {
    portId: 'aden',
    label: 'Ottoman Pasha of Aden',
    office: 'Garrison and customs authority',
    authorityKind: 'customs',
    buildingLabel: 'Ottoman Custom House',
    buildingSub: 'Red Sea customs office',
    creditPatron: 'Aden customs farmer',
    commissionStyle: 'customs',
    note: 'Aden is an Ottoman-held Red Sea gate where garrison power and customs farming meet.',
  },
  mocha: {
    portId: 'mocha',
    label: 'Mocha Customs Farmer',
    office: 'Local Yemeni port authority under Ottoman suzerainty',
    authorityKind: 'customs',
    buildingLabel: 'Mocha Custom House',
    buildingSub: 'coffee customs office',
    creditPatron: 'Mocha coffee brokers',
    commissionStyle: 'customs',
    note: 'Mocha is best represented as a customs and brokerage regime around coffee, not a generic governorate.',
  },
  socotra: {
    portId: 'socotra',
    label: 'Mahra Sheikh',
    office: 'Local Mahri authority',
    authorityKind: 'local-broker',
    buildingLabel: "Mahra Sheikh's House",
    buildingSub: 'local island authority',
    creditPatron: 'Mahra island brokers',
    commissionStyle: 'local-barter',
    note: 'Socotra should not be treated as a Portuguese garrison-port in 1612 gameplay; Mahra authority is the plausible contact.',
  },
  bantam: {
    portId: 'bantam',
    label: 'Sultan of Banten',
    office: 'Sultan Abulmafakhir and court officials',
    authorityKind: 'sultanate',
    buildingLabel: "Sultan's Court",
    buildingSub: 'Banten sultanate',
    creditPatron: 'Banten court brokers',
    commissionStyle: 'merchant-house',
    note: 'Banten grants European privileges through court politics, regents, and shahbandars rather than colonial offices.',
  },
  nagasaki: {
    portId: 'nagasaki',
    label: 'Nagasaki Bugyo',
    office: 'Magistrate and local daikan Murayama Toan',
    authorityKind: 'magistracy',
    buildingLabel: 'Nagasaki Magistrate',
    buildingSub: 'Tokugawa port magistracy',
    creditPatron: 'Nagasaki silver brokers',
    commissionStyle: 'customs',
    note: 'Nagasaki trade is mediated through Tokugawa magistracy and local brokers during the Portuguese Japan trade.',
  },
  amsterdam: {
    portId: 'amsterdam',
    label: 'VOC Amsterdam Chamber',
    office: 'VOC directors and Heeren XVII',
    authorityKind: 'company',
    buildingLabel: 'VOC Chamber',
    buildingSub: 'Dutch East India Company directors',
    creditPatron: 'VOC Amsterdam Chamber',
    commissionStyle: 'company',
    note: 'A long-distance spice trader deals less with a governor than with VOC directors, city regents, and company capital.',
  },
  london: {
    portId: 'london',
    label: 'East India Company Court',
    office: 'Governor Sir Thomas Smythe and the Court of Committees',
    authorityKind: 'company',
    buildingLabel: 'East India House',
    buildingSub: 'English East India Company',
    creditPatron: 'East India Company',
    commissionStyle: 'company',
    note: 'London authority for eastern trade is the chartered company and its court, not the city mayor alone.',
  },
  venice: {
    portId: 'venice',
    label: 'Cinque Savi alla Mercanzia',
    office: 'Venetian trade magistracy',
    authorityKind: 'customs',
    buildingLabel: 'Savi alla Mercanzia',
    buildingSub: 'Venetian trade magistracy',
    creditPatron: 'Venetian spice syndics',
    commissionStyle: 'merchant-house',
    note: 'Venice is governed through magistracies and brokers; the trade authority is institutional rather than a single prince.',
  },
  cape: {
    portId: 'cape',
    label: 'Khoikhoi Trading Intermediaries',
    office: 'Seasonal cattle-trade elders near Table Bay',
    authorityKind: 'no-state',
    buildingLabel: 'Table Bay Trading Camp',
    buildingSub: 'seasonal barter camp',
    creditPatron: 'Table Bay cattle traders',
    commissionStyle: 'local-barter',
    note: 'There is no European governor or fort before 1652. Trade is episodic barter with Khoikhoi groups.',
  },
  zanzibar: {
    portId: 'zanzibar',
    label: 'Mwinyi Mkuu',
    office: 'Local Swahili ruler under nominal Portuguese pressure',
    authorityKind: 'sultanate',
    buildingLabel: "Sultan's Residence",
    buildingSub: 'Swahili local authority',
    creditPatron: 'Zanzibar coastal brokers',
    commissionStyle: 'merchant-house',
    note: 'Portuguese influence is indirect; the practical contact is the local Swahili ruler and coastal broker network.',
  },
  jamestown: {
    portId: 'jamestown',
    label: 'Virginia Company Marshal',
    office: 'Sir Thomas Dale in 1612',
    authorityKind: 'company',
    buildingLabel: 'Virginia Company Storehouse',
    buildingSub: 'company colonial storehouse',
    creditPatron: 'Virginia Company',
    commissionStyle: 'company',
    note: 'Jamestown is a company colony. A trader deals with company stores and martial colonial officers.',
  },
};

export function authorityForPort(portId: string): PortAuthority | null {
  return PORT_AUTHORITIES[portId] ?? null;
}
