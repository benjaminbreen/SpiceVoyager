// ── Historical notes for commodity detail view ──
// Real historical context for each tradeable good, c. 1600-1620.
// Each entry includes a short essay and further reading references.

import type { Commodity } from './commodities';

export interface HistoricalNote {
  text: string;
  sources: string[];
}

export const COMMODITY_HISTORICAL_NOTES: Partial<Record<Commodity, HistoricalNote>> = {
  'Black Pepper': {
    text: 'Black pepper was the single most important commodity in the Indian Ocean trade. The Malabar Coast held a near-monopoly on production, and control of the pepper trade was the primary motive behind the Portuguese voyage to India in 1498. By 1600, the Portuguese Estado da India was losing its grip on the trade to both English and Dutch interlopers and to local merchants who circumvented the cartaz system. A quintal of pepper bought for 2-3 cruzados in Cochin could sell for 20-30 in Lisbon.',
    sources: [
      'Pearson, The Indian Ocean (2003)',
      'Dalby, Dangerous Tastes (2000)',
      'Subrahmanyam, The Career and Legend of Vasco da Gama (1997)',
    ],
  },
  'Cinnamon': {
    text: 'Ceylon cinnamon (Cinnamomum verum) was the prize of the Portuguese Estado da India. After establishing control over coastal Sri Lanka through a 1518 treaty with the Kingdom of Kotte, the Portuguese forced Salagama caste peelers to harvest bark as corvée labor — a system the Dutch later intensified. The real product was routinely cut with Chinese cassia (C. cassia), a cheaper relative that even experienced buyers struggled to distinguish. Garcia de Orta, writing in Goa in 1563, noted the fraud was widespread.',
    sources: [
      'Garcia de Orta, Colóquios dos simples e drogas (Goa, 1563)',
      'Ferrão, A aventura das plantas e os descobrimentos (1993)',
      'Dalby, Dangerous Tastes (2000)',
    ],
  },
  'Cardamom': {
    text: 'Cardamom grew wild in the hills behind the Malabar Coast, harvested by forest-dwelling communities and funneled to coastal markets alongside pepper. It was a secondary but reliable trade good — less glamorous than pepper or cinnamon but always in demand. Arab merchants had traded it for centuries before the Portuguese arrived, using it as a flavoring, breath freshener, and digestive remedy.',
    sources: [
      'Pires, Suma Oriental (c. 1515)',
      'Dalby, Dangerous Tastes (2000)',
    ],
  },
  'Coffee': {
    text: 'In 1600, coffee was still an Arabian monopoly centered on Mocha in Yemen. The beans were cultivated in the Yemeni highlands and shipped through the Red Sea port. Coffee houses (qahveh khaneh) were spreading across the Ottoman Empire, though some religious authorities condemned the drink as an intoxicant. European traders were just beginning to take notice — the VOC would not establish regular coffee imports until the 1620s.',
    sources: [
      'Hattox, Coffee and Coffeehouses (1985)',
      'Topik & Clarence-Smith, The Global Coffee Economy (2003)',
    ],
  },
  'Tea': {
    text: 'Tea was barely known outside East Asia in 1600. Chinese merchants funneled small quantities through Macau, and a few Jesuit missionaries wrote curious descriptions of the drink. It would take decades before European demand developed — the Dutch began importing tea commercially only in the 1610s, and the English later still. For now, it was an exotic curiosity, available only in small quantities at ports with Chinese trading connections.',
    sources: [
      'Mair & Hoh, The True History of Tea (2009)',
      'Moxham, Tea: Addiction, Exploitation, and Empire (2003)',
    ],
  },
  'Ginger': {
    text: 'Ginger was one of the oldest and most widely traded spices in the Indian Ocean world. Malabar and Southeast Asian varieties dominated, though the plant grew across the tropics. Unlike pepper or cinnamon, ginger was never the object of monopoly — too many regions produced it. It was used medicinally (for nausea, digestion, and warming the humors) as well as in cooking. Dried ginger traveled well and was a reliable, if unglamorous, trade good.',
    sources: [
      'Dalby, Dangerous Tastes (2000)',
      'Pires, Suma Oriental (c. 1515)',
    ],
  },
  'Cloves': {
    text: 'Cloves grew nowhere on earth except a handful of tiny islands in the Maluku archipelago — Ternate, Tidore, Makian, Motir, and Bacan. This extreme geographic concentration made them fabulously valuable and the object of intense colonial competition. The Portuguese established a fortress on Ternate in 1522, but the Dutch VOC would eventually seize the trade entirely, going so far as to destroy clove trees on islands they did not control to maintain their monopoly.',
    sources: [
      'Milton, Nathaniel\'s Nutmeg (1999)',
      'Andaya, The World of Maluku (1993)',
      'Pires, Suma Oriental (c. 1515)',
    ],
  },
  'Nutmeg': {
    text: 'Nutmeg came exclusively from the Banda Islands, a minuscule archipelago in eastern Indonesia. The tiny volcanic islands produced a spice worth more per weight than gold in European markets. By 1600, local Bandanese merchants still controlled much of the trade, selling to Javanese, Malay, and Portuguese intermediaries. The VOC would later conquer the islands outright in 1621, massacring or enslaving much of the indigenous population to secure total monopoly.',
    sources: [
      'Milton, Nathaniel\'s Nutmeg (1999)',
      'Lape, Contact and Conflict in the Banda Islands (2000)',
      'Hanna, Indonesian Banda (1978)',
    ],
  },
  'Saffron': {
    text: 'Persian and Kashmiri saffron — the dried stigmas of Crocus sativus — was the most expensive spice by weight. Each flower produced only three tiny threads, requiring vast labor to harvest. Saffron was used as a dye, medicine, and flavoring. Its extreme value made it a prime target for adulteration: turmeric, safflower petals, and even dyed meat fibers were mixed in. Experienced merchants tested saffron by pressing it between damp papers to check the color.',
    sources: [
      'Dalby, Dangerous Tastes (2000)',
      'Humphries, Saffron (2004)',
    ],
  },
  'Tobacco': {
    text: 'Tobacco was a New World plant just arriving in Indian Ocean markets around 1600. Portuguese sailors and merchants were the primary vector, carrying the habit from Brazil to Goa, Malacca, and beyond. By the 1610s, tobacco smoking had spread with remarkable speed across South and Southeast Asia, often outpacing official attempts to ban it. Some Islamic authorities condemned it as an intoxicant; others argued it was merely a novelty. Within two decades it would become one of the most traded commodities in the region.',
    sources: [
      'Goodman, Tobacco in History (1993)',
      'Matthee, The Pursuit of Pleasure: Drugs and Stimulants in Iranian History (2005)',
      'Breen, The Age of Intoxication (2019)',
    ],
  },
  'Cacao': {
    text: 'Cacao was a Mesoamerican stimulant and medicine before it became a European luxury. In New Spain, cacao beans moved through tribute, market exchange, and Spanish Atlantic shipping, usually prepared as chocolate with local spices and later sugar. Veracruz was the Atlantic exit point for cacao entering the flota system, while Seville handled its redistribution in Iberia.',
    sources: [
      'Marcy Norton, Sacred Gifts, Profane Pleasures (2008)',
      'Sophie D. Coe and Michael D. Coe, The True History of Chocolate (1996)',
      'Breen, The Age of Intoxication (2019)',
    ],
  },
  'Cochineal': {
    text: 'Cochineal, made from dried scale insects raised on nopal cactus, was one of New Spain\'s most valuable exports after silver. Its brilliant crimson dye was compact, durable, and highly prized by European textile producers. By the early seventeenth century it moved from Oaxaca and Puebla through Veracruz to Seville under close royal scrutiny.',
    sources: [
      'Amy Butler Greenfield, A Perfect Red (2005)',
      'Carlos Marichal, Mexican Cochineal and the European Demand for American Dyes',
      'J. H. Elliott, Empires of the Atlantic World (2006)',
    ],
  },
  'Opium': {
    text: 'Indian opium, produced primarily in the Cambay (Gujarat) region, was carried eastward by Portuguese traders to markets in Malacca, China, and the Indonesian archipelago. It served as both medicine and recreational drug. In this period opium was not yet the object of moral panic it would become — it was simply one of many materia medica traded alongside rhubarb, camphor, and bezoar stones. Portuguese physicians in Goa used it routinely, following both Galenic and local Ayurvedic traditions.',
    sources: [
      'Dikötter, Laamann & Xun, Narcotic Culture (2004)',
      'Matthee, The Pursuit of Pleasure (2005)',
      'Breen, The Age of Intoxication (2019)',
    ],
  },
  'Camphor': {
    text: 'Bornean camphor (Dryobalanops aromatica) was considered vastly superior to the Chinese variety and could fetch ten times the price. It was used medicinally, in religious rituals, and as a preservative. Arab and Chinese traders had dealt in Bornean camphor for centuries. Tome Pires noted that the best camphor came from Fansur (Barus) on Sumatra\'s west coast, where local producers controlled access and kept prices high.',
    sources: [
      'Pires, Suma Oriental (c. 1515)',
      'Donkin, Dragon\'s Brain Perfume (1999)',
    ],
  },
  'Benzoin': {
    text: 'Benzoin resin (from Styrax trees) came primarily from the interior forests of Sumatra and mainland Southeast Asia. It was burned as incense in churches and mosques alike, and used medicinally as an expectorant. European apothecaries knew it as "gum benjamin." Sumatran benzoin reached global markets through Malay and Javanese intermediaries at ports like Malacca and Bantam.',
    sources: [
      'Pires, Suma Oriental (c. 1515)',
      'Donkin, Between East and West: The Moluccas (2003)',
    ],
  },
  'Frankincense': {
    text: 'Frankincense (olibanum) came from Boswellia trees growing in the arid highlands of southern Arabia and the Horn of Africa, particularly Dhofar, Hadramaut, and northern Somalia. It had been traded for millennia — ancient Egypt, Rome, and Persia all prized it as sacred incense. By 1600, demand remained strong across Christian, Islamic, and Hindu religious contexts. The Omani and Hadrami merchants who controlled the trade operated extensive networks connecting East Africa to India and beyond.',
    sources: [
      'Peacock & Peacock, The World of the Indian Ocean (2008)',
      'Pires, Suma Oriental (c. 1515)',
    ],
  },
  'Myrrh': {
    text: 'Like frankincense, myrrh came from the Arabian and East African coasts, harvested from Commiphora trees. It was valued as a medicine (for wound treatment, oral health, and as a tonic), as incense, and as an embalming material. Myrrh and frankincense were often traded together, following the same routes from the Horn of Africa through the Red Sea and Persian Gulf. Portuguese traders encountered a well-established myrrh trade when they arrived in the Indian Ocean.',
    sources: [
      'Peacock & Peacock, The World of the Indian Ocean (2008)',
      'Dalby, Dangerous Tastes (2000)',
    ],
  },
  'Rhubarb': {
    text: '"True rhubarb" (Rheum palmatum) grew in the mountains of western China and Tibet. It reached European and Islamic markets through Central Asian caravan routes, arriving at Mediterranean ports via Aleppo or through the Indian Ocean via Hormuz. European physicians considered it one of the most important drugs in the pharmacopeia — a powerful purgative believed to cleanse the body of corrupt humors. Its long overland journey made it expensive and frequently adulterated.',
    sources: [
      'Foust, Rhubarb: The Wondrous Drug (1992)',
      'Breen, The Age of Intoxication (2019)',
    ],
  },
  'China Root': {
    text: 'China root (Smilax china) exploded onto global markets in the 1530s as a purported cure for syphilis, "the French disease." Chinese physicians had long used it, but European demand created a massive new export market. Garcia de Orta was skeptical of its efficacy, noting that it worked no better than the American guaiacum wood that preceded it. Nevertheless, demand remained strong throughout the sixteenth century — desperate patients would pay almost anything for a promised cure.',
    sources: [
      'Garcia de Orta, Colóquios dos simples e drogas (1563)',
      'Breen, The Age of Intoxication (2019)',
      'Cook, Matters of Exchange (2007)',
    ],
  },
  'Cassia Fistula': {
    text: 'The long black pods of Cassia fistula, native to India, contained a sweet pulp used as a gentle purgative in both Ayurvedic and Galenic medicine. It was one of the cheaper drugs in the trade — widely available and difficult to adulterate. Portuguese physicians in Goa used it extensively, often prescribing it to sailors suffering from digestive complaints after long voyages. Garcia de Orta praised it as one of the few Indian drugs that lived up to its reputation.',
    sources: [
      'Garcia de Orta, Colóquios dos simples e drogas (1563)',
      'Walker, Plants and Colonial Knowledge (2013)',
    ],
  },
  'Aloes': {
    text: 'Aloeswood (agarwood, from Aquilaria trees) was one of the most precious aromatics in the Indian Ocean world. The resinous heartwood, produced only when the tree was infected by a specific mold, was burned as incense in Chinese, Japanese, Islamic, and Hindu religious contexts. The finest grades came from the forests of mainland Southeast Asia and Sumatra. By 1600, overharvesting was already making high-quality aloeswood increasingly scarce.',
    sources: [
      'Pires, Suma Oriental (c. 1515)',
      'Donkin, Dragon\'s Brain Perfume (1999)',
    ],
  },
  'Musk': {
    text: 'Musk came from the dried secretion of the musk deer (Moschus moschiferus), a small animal native to the mountains of Tibet, western China, and Siberia. The dried "pod" or gland was worth extraordinary sums — rivaling saffron and ambergris as one of the most expensive substances in global trade. Its powerful scent made it essential for perfumery, but it was also used medicinally. The difficulty of obtaining it (and the ease of faking it) made musk one of the most frequently adulterated commodities.',
    sources: [
      'King, The Musk Trade (2007)',
      'Dalby, Dangerous Tastes (2000)',
    ],
  },
  'Quicksilver': {
    text: 'Mercury (quicksilver) was one of the few commodities that flowed primarily from west to east. European mines, especially at Almadén in Spain, produced mercury that was shipped to India and Southeast Asia for use in gold and silver extraction via amalgamation. It was also a key ingredient in medicine and alchemy — physicians prescribed mercury compounds for syphilis, skin diseases, and as a purgative, despite its obvious toxicity. Handling mercury was dangerous work; the miners at Almadén rarely lived long.',
    sources: [
      'Breen, The Age of Intoxication (2019)',
      'Goldwater, Mercury: A History of Quicksilver (1972)',
    ],
  },
  'Tamarind': {
    text: 'Tamarind pulp was ubiquitous across the Indian Ocean as a food preservative, flavoring, and medicine. It was too common and too cheap to be glamorous, but it was indispensable. Sailors used it to prevent scurvy (it is rich in vitamin C, though they did not know this). In Ayurvedic medicine it was prescribed for digestive ailments, and in Arab cooking it was a standard souring agent. Its very ordinariness made it reliable cargo — there was always demand.',
    sources: [
      'Dalby, Dangerous Tastes (2000)',
      'Pires, Suma Oriental (c. 1515)',
    ],
  },
  'Indigo': {
    text: 'Indigo dye, produced primarily in Gujarat, was in insatiable demand in Europe, where it competed with (and was gradually replacing) the local woad plant. European dyers\' guilds fought hard against indigo imports, and several German states banned it as "the devil\'s dye." But the superior color and lower cost of Indian indigo made its triumph inevitable. The production process — fermenting indigo leaves in vats, then oxidizing and drying the sediment — was labor-intensive and foul-smelling.',
    sources: [
      'Balfour-Paul, Indigo (1998)',
      'Riello & Roy, How India Clothed the World (2009)',
    ],
  },
  'Iron': {
    text: 'Bar iron and steel were essential trade goods, flowing primarily from India and Europe to East Africa and Southeast Asia. Indian wootz steel was renowned for its quality — it was the raw material for Damascus swords. In East Africa, iron was one of the few goods that coastal communities would accept in exchange for gold and ivory. Portuguese traders quickly learned that iron bars were as good as currency along the Swahili coast.',
    sources: [
      'Chaudhuri, Trade and Civilisation in the Indian Ocean (1985)',
      'Pearson, The Indian Ocean (2003)',
    ],
  },
  'Timber': {
    text: 'Malabar teak was the best shipbuilding wood in the Indian Ocean. Dense, durable, and resistant to rot and marine borers, it was essential for constructing and repairing vessels. The Portuguese established timber reserves along the Malabar Coast, and access to teak was one reason Goa remained strategically vital even as the spice trade shifted. Timber was heavy and bulky — profitable only on short routes — but always in demand at any port with a shipyard.',
    sources: [
      'Pires, Suma Oriental (c. 1515)',
      'Pearson, The Indian Ocean (2003)',
    ],
  },
  'Sugar': {
    text: 'Sugar production was expanding rapidly across the Indian Ocean world in 1600. Bengal was a major producer, and Southeast Asian sugar was entering trade networks. But the real transformation was happening in the Atlantic, where Brazilian sugar plantations (worked by enslaved Africans) were beginning to flood European markets. Indian Ocean sugar increasingly competed with this Atlantic product. Portuguese traders sometimes carried sugar between Indian Ocean ports as a secondary cargo.',
    sources: [
      'Mintz, Sweetness and Power (1985)',
      'Galloway, The Sugar Cane Industry (1989)',
    ],
  },
  'Ivory': {
    text: 'East African elephant ivory was one of the oldest trade goods in the Indian Ocean, with archaeological evidence of the trade stretching back millennia. Tusks from Mozambique and the Swahili coast were shipped to India (for bangles and decorative carving), China (for luxury objects), and Europe. The trade was deeply entangled with the slave trade — the same caravan routes carried both ivory and enslaved people from the interior to the coast.',
    sources: [
      'Sheriff, Slaves, Spices & Ivory in Zanzibar (1987)',
      'Alpers, Ivory and Slaves (1975)',
    ],
  },
  'Chinese Porcelain': {
    text: 'Blue-and-white porcelain from the kilns of Jingdezhen was traded across the entire Indian Ocean world. Known as kraak ware by the Dutch (after the Portuguese carracks that carried it), these ceramics were both luxury goods and diplomatic gifts. The technology to produce true porcelain remained a Chinese monopoly until the eighteenth century. The cargo was fragile — storms and rough handling could destroy an entire shipment — but the markup justified the risk.',
    sources: [
      'Finlay, The Pilgrim Art (2010)',
      'Carswell, Blue and White: Chinese Porcelain Around the World (2000)',
    ],
  },
  'Pearls': {
    text: 'The Persian Gulf pearl fisheries, centered around Bahrain and the waters near Hormuz, had supplied luxury markets for millennia. Divers, often enslaved or indebted, descended to dangerous depths to harvest oysters. The pearls were sorted and graded on shore, then traded to India (where they were drilled and strung), the Ottoman Empire, and Europe. Pearl diving was seasonal, dangerous work with a high mortality rate — but the profits for merchants were enormous.',
    sources: [
      'Carter, Sea of Pearls (2012)',
      'Floor, The Persian Gulf: A Political and Economic History (2006)',
    ],
  },
  'Red Coral': {
    text: 'Mediterranean red coral (Corallium rubrum) traveled in the opposite direction from most Indian Ocean goods — from Europe to Asia. Harvested by divers in the western Mediterranean, it was shipped to India where it was prized for jewelry, amulets, and Hindu religious objects. Coral beads were believed to protect children from illness. The trade was profitable but the cargo was fragile; broken coral lost much of its value.',
    sources: [
      'Trivellato, The Familiarity of Strangers (2009)',
      'Riello & Roy, How India Clothed the World (2009)',
    ],
  },
  'Rose Water': {
    text: 'Persian rose water, distilled from Damascus roses (Rosa damascena), was traded across the Indian Ocean for use in cooking, perfumery, medicine, and religious ritual. Iranian producers, centered around Shiraz and Isfahan, had perfected the distillation process over centuries. Rose water was used to flavor food, scent mosques and churches, and prepare medicines. The glass bottles it was shipped in were themselves fragile luxury goods.',
    sources: [
      'Floor, The Persian Gulf (2006)',
      'Bahadur, The Rose and the Nightingale (2019)',
    ],
  },
  'Ambergris': {
    text: 'Ambergris — a waxy substance produced in the digestive tract of sperm whales — washed ashore unpredictably on beaches across the Indian Ocean. Fresh ambergris smelled foul, but aged specimens developed a complex, sweet scent that made them invaluable as a perfume fixative. It was also used medicinally, prescribed as a cardiac stimulant and aphrodisiac. The rarity and randomness of supply made ambergris one of the most frequently counterfeited substances in the trade.',
    sources: [
      'Kemp, Floating Gold: A Natural (and Unnatural) History of Ambergris (2012)',
      'King, The Musk Trade (2007)',
    ],
  },
  'Bezoar Stones': {
    text: 'Bezoar stones — calcified masses found in the stomachs of goats, particularly Persian wild goats — were believed to be universal antidotes to poison. In an era when assassination by poisoning was a genuine political tool, bezoars commanded extraordinary prices. They were tested by scratching the surface (real bezoars had concentric layers) and by dipping them in arsenic solutions. The fraud rate was staggeringly high — Ambroise Paré famously tested a bezoar on a condemned prisoner in 1567, who promptly died.',
    sources: [
      'Breen, The Age of Intoxication (2019)',
      'Findlen, Early Modern Things (2013)',
    ],
  },
  'Bhang': {
    text: 'Bhang, a preparation of cannabis leaves and flowers, was widely consumed across the Indian subcontinent and parts of Southeast Asia. It was mixed into drinks, eaten as a paste, or smoked. Indian medical traditions classified it as both medicine and intoxicant. Portuguese observers noted its use with a mixture of curiosity and disapproval. Unlike opium, cannabis preparations were cheap and locally available, making them difficult to control or monopolize.',
    sources: [
      'Mills, Cannabis Britannica (2003)',
      'Matthee, The Pursuit of Pleasure (2005)',
    ],
  },
  "Dragon's Blood": {
    text: "Dragon's blood resin came from Dracaena cinnabari trees found almost exclusively on the island of Socotra, off the Horn of Africa. The deep crimson resin was used as a dye, varnish, and medicine — believed to stop bleeding and heal wounds. Socotra had been a waypoint for Indian Ocean traders since antiquity, and its dragon's blood was known to the ancient Greeks, Romans, and Chinese alike. By 1612, the Portuguese occupation was long over; Mahri and regional brokers mattered more than European garrison power.",
    sources: [
      'Doe, Socotra: Island of Tranquility (1992)',
      'Dalby, Dangerous Tastes (2000)',
    ],
  },
  'Mumia': {
    text: 'Mumia — supposedly derived from Egyptian mummies — was one of the most sought-after and most fraudulent drugs in the early modern pharmacopeia. European and Islamic physicians believed that the bituminous substance used in ancient embalming had powerful healing properties. In practice, most "mumia" sold in markets was simply bitumen, pitch, or tar mixed with bone fragments. The real trade in actual mummified remains did exist, but it was dwarfed by the counterfeit market. Garcia de Orta dismissed most mumia as obvious fraud.',
    sources: [
      'Breen, The Age of Intoxication (2019)',
      'Dannenfeldt, "Egyptian Mumia" (1985)',
      'Noble, Medicinal Cannibalism in Early Modern Literature (2011)',
    ],
  },
  'Lapis de Goa': {
    text: 'The Lapis de Goa (Pedra de Goa) was an artificial bezoar manufactured by Jesuit pharmacists in Goa, made from a secret recipe that included gold leaf, ground gemstones, musk, ambergris, and various herbs bound together and stamped with the IHS monogram. It was marketed as a superior alternative to natural bezoar stones — a universal antidote and cure-all. The Jesuits exported these gilded pills across their global network, from Japan to Brazil, making the Lapis de Goa one of the first globally marketed pharmaceutical products.',
    sources: [
      'Breen, The Age of Intoxication (2019)',
      'Walker, "The Medicines Trade in the Portuguese Atlantic World" (2013)',
      'Fontes da Costa, "Secrecy and Openness in the Lapis de Goa" (2012)',
    ],
  },
};
