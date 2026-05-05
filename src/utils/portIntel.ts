// Port intel shared by NPC captains when hailed.
// One grounded sentence or two per port — anchorage conditions, who holds
// the place in 1612, and the character of its trade. Used by the hail panel
// "ask about a port" action as the reward text.

import type { ShipTraditionId } from './npcShipGenerator';
import type { Weighted } from './npcShipGenerator';

export const PORT_INTEL: Record<string, string> = {
  aden: "A Yemeni port at the mouth of the Red Sea, walled against volcanic bluffs. Ottoman authority is nominal — Qasimi imams and Gujarati factors run the trade in coffee and incense.",
  amsterdam: "The VOC's home water. The Y opens onto a forest of masts; wharves north of the Damrak are stacked with Baltic timber and East Indies pepper.",
  bantam: "West Java's pepper port — shallow roadstead, pestilential in the wet season. The sultan taxes every chest; the Dutch factory sits uneasy beside the English one.",
  calicut: "The Samutiri's capital on Malabar, a roadstead with no true harbor — ships ride open sea off Kappad. Pepper, sandalwood, and a long memory of Portuguese violence.",
  cape: "The Cape's fresh-water stop. No European fort yet; Khoikhoi herders trade sheep for iron and beads on the strand below Table Mountain.",
  cartagena: "Spain's Caribbean treasure-port behind stone bastions. Galleons refit here before the Atlantic crossing; slave ships unload on the Getsemaní side.",
  colombo: "Portuguese Colombo is the fortified mouth of Ceylon's cinnamon trade. The fort controls export, but peelers, brokers, and inland Sinhala politics decide what reaches the quay.",
  diu: "A Portuguese island-fortress off Kathiawar, guarding the Gulf of Cambay. The cartaz passes that bleed Gujarati shipping are issued from its customs house.",
  elmina: "The Portuguese São Jorge da Mina on the Gold Coast — a stone castle on a sea-pounded headland, the oldest European fort south of the Sahara. Gold dust and captives move through its courtyards.",
  goa: "Capital of the Estado da Índia on the Mandovi estuary. Tropical, viceregal, riddled with fevers; the bar must be taken at high tide, and the cathedral bells rule the working day.",
  havana: "The Spanish convoy port on Cuba's north coast. The harbor is a narrow channel behind El Morro; plate fleets winter here before the Bermuda crossing.",
  hormuz: "Portuguese fortress on a salt-baked island at the gulf's mouth. Waterless, brutal in summer — but every Persian silk and Gujarati cloth crossing the gulf pays duty here.",
  jamestown: "An English settlement on the James River in Virginia, six years old and still precarious. Tobacco is starting to pay; palisades face inland at the Powhatan.",
  lisbon: "The Tagus opens wide below the city; the Casa da Índia weighs every pepper sack from the carreira. Africans, Jews, New Christians, and Flemish merchants throng the riverfront.",
  london: "The Pool below the Bridge is thick with colliers and East Indiamen. The Royal Exchange and the EIC's Crosby House are the new money; the Customs House is the old.",
  luanda: "The Portuguese slaving port on the Angolan coast. A sheltered bay behind a low island; the presídio takes captives from the Ndongo wars inland.",
  macau: "Portuguese concession at the mouth of the Pearl River, tolerated by Ming officials who prefer distant barbarians to close ones. Silver in, silk and porcelain out.",
  malacca: "The Portuguese A Famosa fortress commands the strait between Sumatra and the peninsula. Every cargo bound for China or the spice islands passes under its guns.",
  manila: "The Spanish bastion on Luzon, terminus of the galleon trade to Acapulco. Chinese junks crowd the Parián, carrying silk for American silver.",
  masulipatnam: "The Golconda sultanate's Coromandel port — an open roadstead of painted cottons and diamonds. The VOC and EIC factories compete for weavers inland.",
  mocha: "The Yemeni coffee port on the Red Sea. The bean has only lately become a commodity for Europeans; the roadstead is shallow and the customs heavy.",
  mombasa: "Portuguese Fort Jesus looms over a twin-harbored Swahili town. The Mazrui clan watches for the day the Estado weakens.",
  muscat: "Portuguese-held deep-water harbor on the Omani coast, ringed by watchtowers. Date-palm country inland; every ship bound up the gulf waters here.",
  nagasaki: "The only Japanese port the Portuguese are still permitted. A narrow inlet of Kyushu, Jesuit and Bakufu-watched; silk for silver, and the persecutions are beginning.",
  salvador: "Capital of Portuguese Brazil on the Bay of All Saints. Sugar engenhos inland, African captives arriving daily through the lower town.",
  seville: "The Casa de Contratación's monopoly port, seventy miles up the Guadalquivir. American silver passes through its scales before dispersing across Europe.",
  socotra: "A bare island at the mouth of the gulf of Aden — frankincense, aloes, and little else. The Mahra sultan is nominal; water and shelter are the real trade.",
  surat: "The Mughal empire's chief port on the Tapti. Gujarati and Banian houses dominate; the English and Dutch factories are new, watched from the shahbandar's office.",
  venice: "The Rialto is no longer the world's clearing-house, but the Stato da Màr still reaches to Cyprus and the Morea. Spice prices are watched with an eye to Lisbon.",
  veracruz: "New Spain's Gulf gate. Cochineal, cacao, hides, and silver accounts come down from Mexico City before the flota gathers for Havana and Seville.",
  zanzibar: "A Swahili island off the east African coast. Local rulers and brokers manage ivory, ambergris, coconuts, and mangrove timber under thin Portuguese pressure.",
};

// Each tradition's plausible travel circuit — weighted by how commonly
// ships of that kind would have touched the port in ~1612. Used to seed
// each NPC with a short visitedPorts list at spawn.
export const TRADITION_VISITED_PORTS: Record<ShipTraditionId, Weighted<string>[]> = {
  portuguese_estado: [
    ['goa', 30], ['malacca', 18], ['hormuz', 16], ['macau', 14], ['nagasaki', 10],
    ['mombasa', 12], ['diu', 14], ['muscat', 10], ['mocha', 8], ['calicut', 10],
    ['lisbon', 12], ['zanzibar', 8], ['cape', 8], ['socotra', 6], ['surat', 4], ['colombo', 8],
  ],
  dutch_voc: [
    ['bantam', 26], ['amsterdam', 20], ['masulipatnam', 14], ['malacca', 10],
    ['surat', 10], ['nagasaki', 10], ['cape', 14], ['mocha', 6], ['calicut', 6], ['colombo', 6],
  ],
  english_eic: [
    ['london', 22], ['surat', 20], ['bantam', 16], ['masulipatnam', 14],
    ['mocha', 10], ['aden', 8], ['cape', 12], ['calicut', 6],
  ],
  gujarati_merchant: [
    ['surat', 28], ['diu', 18], ['hormuz', 14], ['aden', 12], ['mocha', 12],
    ['muscat', 10], ['zanzibar', 8], ['mombasa', 8], ['calicut', 12], ['malacca', 6],
  ],
  mughal_surati: [
    ['surat', 32], ['diu', 18], ['masulipatnam', 14], ['calicut', 10],
    ['hormuz', 10], ['mocha', 12], ['aden', 8],
  ],
  omani_dhow: [
    ['muscat', 28], ['hormuz', 16], ['aden', 14], ['mocha', 10], ['socotra', 10],
    ['zanzibar', 14], ['mombasa', 14], ['surat', 10], ['calicut', 8],
  ],
  swahili_coaster: [
    ['mombasa', 28], ['zanzibar', 22], ['muscat', 10], ['aden', 8], ['socotra', 8],
    ['mocha', 8], ['surat', 6], ['calicut', 6],
  ],
  ottoman_red_sea: [
    ['mocha', 26], ['aden', 22], ['socotra', 12], ['muscat', 8], ['hormuz', 8], ['surat', 6],
  ],
  persian_gulf: [
    ['hormuz', 30], ['muscat', 18], ['aden', 8], ['surat', 14], ['diu', 10],
    ['calicut', 6], ['mocha', 8],
  ],
  malay_prau: [
    ['malacca', 26], ['bantam', 22], ['manila', 10], ['macau', 10],
    ['surat', 6], ['calicut', 4],
  ],
  acehnese_raider: [
    ['malacca', 24], ['bantam', 16], ['surat', 10], ['calicut', 8], ['goa', 6],
  ],
  javanese_jong: [
    ['bantam', 26], ['malacca', 20], ['macau', 10], ['manila', 10], ['nagasaki', 6],
  ],
  chinese_junk: [
    ['macau', 28], ['nagasaki', 20], ['manila', 18], ['malacca', 14], ['bantam', 10],
  ],
  japanese_red_seal: [
    ['nagasaki', 30], ['manila', 16], ['macau', 14], ['malacca', 10], ['bantam', 8],
  ],
  spanish_atlantic: [
    ['seville', 24], ['havana', 22], ['cartagena', 20], ['veracruz', 18], ['manila', 8],
    ['cape', 4], ['salvador', 6], ['lisbon', 8],
  ],
  french_atlantic: [
    ['lisbon', 14], ['london', 10], ['seville', 14], ['cartagena', 12], ['veracruz', 8],
    ['havana', 12], ['elmina', 8],
  ],
  english_atlantic: [
    ['london', 26], ['jamestown', 16], ['lisbon', 10], ['seville', 8],
    ['elmina', 8], ['havana', 8], ['cartagena', 6], ['cape', 4],
  ],
  portuguese_atlantic: [
    ['lisbon', 26], ['salvador', 20], ['elmina', 16], ['luanda', 14],
    ['cape', 10], ['goa', 6], ['seville', 6],
  ],
  dutch_atlantic: [
    ['amsterdam', 26], ['lisbon', 10], ['elmina', 14], ['luanda', 10],
    ['salvador', 8], ['cape', 12], ['cartagena', 6],
  ],
  local_caribbean: [
    ['havana', 26], ['cartagena', 24], ['veracruz', 20], ['salvador', 12], ['jamestown', 8],
  ],
};
