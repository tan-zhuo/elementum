/**
 * 每个分子的作用与生活应用。
 *
 * 由 scripts/build-molecules.mjs 合并进 molecules.json，构建期断言每个分子都有条目。
 * 有些分子（H₂S、NO₂、CCl₄）在生活中主要以危害或已淘汰的用途出现，就照实写，
 * 不硬凑成正面用途。
 */
export const MOLECULE_USES = {
  // ---- 单质 ----
  h2: {
    zh: '燃烧只产生水，被视为最干净的燃料；工业上大部分氢其实用于合成氨造化肥。',
    en: 'Burning it yields only water, making it the cleanest fuel; industrially, though, most hydrogen goes into ammonia for fertiliser.',
    itemsZh: ['氢燃料电池车与公交', '合成氨化肥', '火箭发动机燃料', '食用油氢化'],
    itemsEn: ['Fuel-cell cars and buses', 'Ammonia fertiliser', 'Rocket fuel', 'Hydrogenating edible oils'],
  },
  o2: {
    zh: '呼吸和燃烧都靠它。医院的供氧、炼钢的吹氧、焊枪的助燃，本质上都是同一件事。',
    en: 'Breathing and burning both need it — hospital oxygen, oxygen steelmaking and a welding torch are all the same reaction.',
    itemsZh: ['医用氧气与急救', '氧炔焊接切割', '炼钢吹氧', '污水处理曝气'],
    itemsEn: ['Medical oxygen', 'Oxy-fuel welding', 'Oxygen steelmaking', 'Wastewater aeration'],
  },
  n2: {
    zh: '化学上极不活泼，正好用来隔绝氧气：薯片袋里鼓鼓的气体就是氮气，防止油脂氧化变味。',
    en: 'Its unreactivity is the point — it keeps oxygen out. The puff of gas in a crisp packet is nitrogen, stopping the oil going rancid.',
    itemsZh: ['食品包装充氮保鲜', '液氮冷冻与冷链', '合成氨的原料', '轮胎与消防充气'],
    itemsEn: ['Nitrogen-flushed food packaging', 'Liquid-nitrogen freezing', 'Feedstock for ammonia', 'Tyre inflation'],
  },
  cl2: {
    zh: '自来水厂投氯杀菌是现代城市能大规模安全供水的前提，也是公共卫生史上最有效的措施之一。',
    en: 'Chlorinating tap water is what makes safe city-scale water supply possible, and one of the most effective public-health measures ever adopted.',
    itemsZh: ['自来水与泳池消毒', '漂白粉与漂白剂', 'PVC 塑料生产', '盐酸制造'],
    itemsEn: ['Tap-water and pool disinfection', 'Bleaching agents', 'PVC manufacture', 'Hydrochloric acid production'],
  },
  o3: {
    zh: '高空的臭氧层挡住紫外线，是地表生命的前提；地面的臭氧则用于杀菌，但吸入有害。',
    en: 'High up, the ozone layer blocks ultraviolet and makes surface life possible; at ground level it disinfects, but is harmful to breathe.',
    itemsZh: ['平流层臭氧层防紫外', '自来水臭氧消毒', '空气净化与除味', '医疗器械灭菌'],
    itemsEn: ['The stratospheric ozone layer', 'Ozone water treatment', 'Air purification', 'Medical sterilisation'],
  },
  f2: {
    zh: '本身太危险不能直接使用，但几乎所有含氟产品都由它制得 —— 从不粘锅到牙膏再到核燃料。',
    en: 'Too dangerous to handle directly, yet nearly every fluorine product starts from it — non-stick coatings, toothpaste, even nuclear fuel.',
    itemsZh: ['制备不粘锅涂层原料', '六氟化铀（铀浓缩）', '牙膏氟化物来源', '含氟制冷剂'],
    itemsEn: ['Precursor to non-stick coatings', 'Uranium hexafluoride for enrichment', 'Source of toothpaste fluoride', 'Refrigerants'],
  },
  br2: {
    zh: '溴化银对光敏感，胶片摄影的整个原理就建立在它上面；溴系阻燃剂则曾遍布电子产品外壳。',
    en: 'Silver bromide is light-sensitive, which is the entire basis of film photography; brominated flame retardants were once everywhere in electronics.',
    itemsZh: ['胶片与相纸感光材料', '阻燃剂', '泳池与水处理消毒', '钻井液'],
    itemsEn: ['Photographic film and paper', 'Flame retardants', 'Pool and water treatment', 'Drilling fluids'],
  },
  i2: {
    zh: '碘酒和碘伏是最常见的伤口消毒剂；食盐加碘则解决了大范围的甲状腺肿和儿童发育问题。',
    en: 'Tincture of iodine and povidone-iodine are the most familiar wound antiseptics; iodised salt solved widespread goitre and developmental problems.',
    itemsZh: ['碘酒与碘伏消毒', '食盐加碘', '淀粉检验（遇碘变蓝）', '碘钨灯与造影剂'],
    itemsEn: ['Iodine antiseptics', 'Iodised salt', 'The starch-iodine test', 'Halogen lamps and contrast agents'],
  },
  p4: {
    zh: '接触空气就会自燃，必须存放在水下。主要用来制磷酸和磷肥，军事上则作燃烧弹和烟幕弹。',
    en: 'It ignites on contact with air and must be stored under water. Mostly converted to phosphoric acid and fertiliser; militarily used in incendiaries and smoke.',
    itemsZh: ['制磷酸与磷肥', '燃烧弹与烟幕弹', '早期火柴（因中毒已禁用）'],
    itemsEn: ['Phosphoric acid and fertiliser', 'Incendiary and smoke munitions', 'Early matches (banned for poisoning)'],
  },
  s8: {
    zh: '轮胎之所以又弹又耐磨，是因为硫在橡胶分子间架起了交联桥 —— 这就是硫化。',
    en: 'Tyres are springy and hard-wearing because sulfur bridges the rubber chains together — that is vulcanisation.',
    itemsZh: ['橡胶硫化（轮胎）', '制硫酸', '葡萄园与果园杀菌剂', '黑火药与烟花'],
    itemsEn: ['Vulcanising rubber tyres', 'Sulfuric acid production', 'Vineyard fungicides', 'Gunpowder and fireworks'],
  },
  c60: {
    zh: '1985 年发现，1996 年即获诺贝尔化学奖。实际应用仍以研究为主：有机太阳能电池、润滑材料和药物载体。',
    en: 'Discovered in 1985 and awarded the Nobel Prize in 1996. Practical use is still mostly research: organic solar cells, lubricants and drug carriers.',
    itemsZh: ['有机太阳能电池受体材料', '润滑与耐磨添加剂研究', '药物递送载体研究'],
    itemsEn: ['Acceptor material in organic solar cells', 'Lubricant additive research', 'Drug-delivery research'],
  },

  // ---- 无机物 ----
  h2o: {
    zh: '能溶解的物质比任何其他液体都多，所以细胞里的化学反应、洗衣服和工业冷却都靠它。',
    en: 'It dissolves more substances than any other liquid, which is why cell chemistry, laundry and industrial cooling all rely on it.',
    itemsZh: ['饮用与生命活动', '溶剂与清洁', '发电厂与工业冷却', '农业灌溉'],
    itemsEn: ['Drinking and life itself', 'Solvent and cleaning', 'Power-plant and industrial cooling', 'Irrigation'],
  },
  h2o2: {
    zh: '分解后只剩水和氧气，不留残留，因此适合伤口消毒和食品级漂白；高浓度则可作火箭推进剂。',
    en: 'It breaks down into just water and oxygen with no residue, so it suits wound antisepsis and food-grade bleaching; concentrated, it is a rocket propellant.',
    itemsZh: ['双氧水伤口消毒', '头发漂白与牙齿美白', '纸浆与织物漂白', '火箭单组元推进剂'],
    itemsEn: ['Wound antiseptic', 'Hair and tooth bleaching', 'Pulp and textile bleaching', 'Monopropellant rockets'],
  },
  h2s: {
    zh: '沼气、下水道和温泉的臭鸡蛋味就是它。剧毒且高浓度下会麻痹嗅觉，是常见的工业事故气体。',
    en: 'The rotten-egg smell of biogas, sewers and hot springs. Highly toxic, and at high concentration it deadens the sense of smell — a frequent industrial hazard.',
    itemsZh: ['下水道与沼气的臭味来源', '工业有毒气体监测对象', '天然气脱硫的硫来源'],
    itemsEn: ['The smell in sewers and biogas', 'A monitored industrial hazard', 'Source of sulfur from sour gas'],
  },
  co: {
    zh: '无色无味却剧毒，与血红蛋白结合力约为氧气的 200 倍 —— 冬季燃气热水器和炭火中毒的元凶。',
    en: 'Colourless, odourless and deadly: it binds haemoglobin about 200 times more tightly than oxygen, the cause of winter heater and charcoal poisonings.',
    itemsZh: ['一氧化碳报警器的监测对象', '炼铁高炉还原剂', '合成气与化工原料'],
    itemsEn: ['What CO alarms detect', 'Reducing agent in blast furnaces', 'Syngas and chemical feedstock'],
  },
  co2: {
    zh: '汽水的气泡、干冰的白雾、灭火器的喷射都是它；同时也是植物光合作用的原料和头号温室气体。',
    en: 'The fizz in soda, the fog from dry ice and the blast from an extinguisher — and also the raw material of photosynthesis and the leading greenhouse gas.',
    itemsZh: ['碳酸饮料气泡', '干冰冷藏与舞台烟雾', '二氧化碳灭火器', '温室气肥与光合作用'],
    itemsEn: ['Fizzy drinks', 'Dry ice for cooling and stage fog', 'CO2 fire extinguishers', 'Photosynthesis and greenhouse enrichment'],
  },
  so2: {
    zh: '葡萄酒瓶上的"含亚硫酸盐"就来自它 —— 能抑菌抗氧化；但排入大气会形成酸雨。',
    en: 'The "contains sulfites" on a wine label traces back to it: an antimicrobial and antioxidant. Released into the air, though, it makes acid rain.',
    itemsZh: ['葡萄酒与干果防腐', '纸浆与织物漂白', '制硫酸的中间体', '酸雨的主要成因'],
    itemsEn: ['Wine and dried-fruit preservation', 'Pulp and textile bleaching', 'Intermediate in sulfuric acid', 'Main cause of acid rain'],
  },
  nh3: {
    zh: '哈伯法合成氨把空气中的氮变成化肥，被认为是养活了地球上约一半人口的化学反应。',
    en: 'The Haber process turns air into fertiliser; it is often credited with feeding roughly half the people alive.',
    itemsZh: ['氮肥（尿素、硝铵）', '工业与冷库制冷剂', '含氨玻璃清洁剂', '柴油车尾气脱硝'],
    itemsEn: ['Nitrogen fertiliser', 'Industrial refrigeration', 'Ammonia glass cleaner', 'Diesel exhaust NOx treatment'],
  },
  hcl: {
    zh: '胃里就有它，负责消化蛋白质和杀灭细菌；家里的除垢剂、洁厕灵也主要靠盐酸。',
    en: 'Your stomach makes it to digest protein and kill bacteria; household descalers and toilet cleaners are mostly hydrochloric acid.',
    itemsZh: ['胃酸（消化与杀菌）', '除垢剂与洁厕灵', '钢材酸洗除锈', '食品与药物生产'],
    itemsEn: ['Stomach acid', 'Descalers and toilet cleaners', 'Steel pickling', 'Food and drug manufacture'],
  },
  hf: {
    zh: '唯一能腐蚀玻璃的常见酸，用于玻璃蚀刻和芯片清洗；但会穿透皮肤直接侵蚀骨骼，极其危险。',
    en: 'The one common acid that attacks glass, used for etching and wafer cleaning — but it penetrates skin and attacks bone, making it extremely dangerous.',
    itemsZh: ['玻璃蚀刻与磨砂', '半导体晶圆清洗', '含氟化合物原料', '铝电解助熔剂'],
    itemsEn: ['Glass etching and frosting', 'Semiconductor wafer cleaning', 'Fluorochemical feedstock', 'Aluminium smelting flux'],
  },
  hcn: {
    zh: '极少量即可致命，是历史上臭名昭著的毒物；工业上却是电镀金银和制造有机玻璃的必需原料。',
    en: 'Lethal in tiny amounts and infamous as a poison, yet industrially essential for gold and silver plating and for making acrylic glass.',
    itemsZh: ['金银电镀与提金', '有机玻璃与尼龙原料', '苦杏仁与木薯中的天然来源'],
    itemsEn: ['Gold and silver plating', 'Feedstock for acrylic and nylon', 'Naturally present in bitter almonds and cassava'],
  },
  no: {
    zh: '人体自身合成它来舒张血管 —— 硝酸甘油治心绞痛和伟哥的作用机理都与之相关，相关研究获 1998 年诺贝尔奖。',
    en: 'The body makes it to relax blood vessels: nitroglycerin for angina and Viagra both work through this pathway, research that won the 1998 Nobel Prize.',
    itemsZh: ['体内血管舒张信号分子', '新生儿肺动脉高压吸入治疗', '汽车尾气与空气污染物'],
    itemsEn: ['Signalling molecule that dilates vessels', 'Inhaled therapy for newborn lung hypertension', 'Vehicle exhaust pollutant'],
  },
  no2: {
    zh: '城市空气质量指标里的"二氧化氮"就是它，主要来自机动车尾气，是光化学烟雾和酸雨的推手。',
    en: 'The NO2 on urban air-quality dashboards, mostly from vehicle exhaust, and a driver of photochemical smog and acid rain.',
    itemsZh: ['空气质量监测指标', '光化学烟雾成因', '制硝酸的中间体'],
    itemsEn: ['Tracked air-quality pollutant', 'Cause of photochemical smog', 'Intermediate in nitric acid production'],
  },
  n2o: {
    zh: '俗称笑气。牙科和分娩镇痛仍在使用，食品上则用作奶油发泡剂 —— 但滥用吸食会造成不可逆的神经损伤。',
    en: 'Laughing gas: still used in dentistry and childbirth analgesia, and as the propellant in whipped cream — but recreational abuse causes irreversible nerve damage.',
    itemsZh: ['牙科与产科镇痛', '奶油发泡剂', '赛车发动机增氧', '强效温室气体'],
    itemsEn: ['Dental and obstetric analgesia', 'Whipped-cream propellant', 'Engine power boosting', 'Potent greenhouse gas'],
  },
  so3: {
    zh: '本身很少直接使用，但它是接触法制硫酸的关键一步 —— 全球每年数亿吨硫酸都要经过它。',
    en: 'Rarely used directly, but it is the pivotal step of the contact process: every one of the hundreds of millions of tonnes of sulfuric acid passes through it.',
    itemsZh: ['制硫酸的关键中间体', '洗涤剂磺化原料', '酸雨形成的中间产物'],
    itemsEn: ['Key intermediate in sulfuric acid', 'Sulfonation for detergents', 'Intermediate in acid-rain formation'],
  },
  bf3: {
    zh: '典型的路易斯酸，极易夺取电子对，因此是有机合成和聚合反应中最常用的催化剂之一。',
    en: 'A textbook Lewis acid that eagerly grabs electron pairs, making it one of the most-used catalysts in organic synthesis and polymerisation.',
    itemsZh: ['有机合成催化剂', '聚合反应引发剂', '中子探测器填充气'],
    itemsEn: ['Organic synthesis catalyst', 'Polymerisation initiator', 'Neutron-detector fill gas'],
  },
  ph3: {
    zh: '磷化铝熏蒸剂遇水放出膦气，是粮仓杀虫的主要手段；剧毒，也用于半导体掺杂。',
    en: 'Aluminium phosphide fumigant releases phosphine on contact with moisture, the mainstay of grain-store pest control; highly toxic, it also dopes semiconductors.',
    itemsZh: ['粮仓熏蒸杀虫', '半导体 n 型掺杂', '沼泽"鬼火"的成因之一'],
    itemsEn: ['Grain fumigation', 'n-type semiconductor doping', 'A cause of marsh will-o’-the-wisps'],
  },
  sf6: {
    zh: '绝缘性能远超空气，高压开关柜里灌的就是它 —— 但它是已知最强的温室气体，单分子效应约为二氧化碳的两万倍。',
    en: 'A far better insulator than air, which is why high-voltage switchgear is filled with it — yet it is the most potent greenhouse gas known, about 20 000 times CO2 per molecule.',
    itemsZh: ['高压电气开关绝缘', '镁合金铸造保护气', '医学超声造影微泡', '最强温室气体之一'],
    itemsEn: ['High-voltage switchgear insulation', 'Magnesium casting cover gas', 'Ultrasound contrast microbubbles', 'Extremely potent greenhouse gas'],
  },
  pcl5: {
    zh: '有机合成中最常用的氯化试剂之一，能把羟基一步换成氯原子，是制药和农药合成的常规工具。',
    en: 'One of the most common chlorinating reagents in organic synthesis, swapping a hydroxyl for chlorine in a single step — routine in pharmaceutical and agrochemical work.',
    itemsZh: ['有机合成氯化试剂', '制药中间体生产', '锂电池电解质原料'],
    itemsEn: ['Chlorinating reagent', 'Pharmaceutical intermediates', 'Precursor for battery electrolytes'],
  },
  xef4: {
    zh: '1962 年前，教科书还断言稀有气体不能形成化合物。氙化合物的合成直接改写了化学的基本认知。',
    en: 'Before 1962 textbooks insisted noble gases could not form compounds. Making xenon compounds rewrote a basic assumption of chemistry.',
    itemsZh: ['改写稀有气体化学的实验', '强氧化剂与氟化试剂', '化学教学的经典案例'],
    itemsEn: ['The experiment that rewrote noble-gas chemistry', 'Strong oxidiser and fluorinating agent', 'A teaching classic'],
  },
  h2so4: {
    zh: '产量常被用来衡量一个国家的工业规模。汽车电瓶里的电解液就是稀硫酸，管道疏通剂也多以浓硫酸为主。',
    en: 'Its output is a classic measure of a country’s industrial scale. The electrolyte in a car battery is dilute sulfuric acid, and drain openers are often concentrated acid.',
    itemsZh: ['汽车铅酸电池电解液', '磷肥生产', '管道疏通剂', '钢材酸洗与化工原料'],
    itemsEn: ['Car battery electrolyte', 'Phosphate fertiliser production', 'Drain openers', 'Steel pickling and chemicals'],
  },
  hno3: {
    zh: '硝酸铵化肥和几乎所有传统炸药（TNT、硝化甘油）都由它制得；与盐酸混合成王水，可溶解黄金。',
    en: 'It makes ammonium nitrate fertiliser and virtually every classical explosive (TNT, nitroglycerin); mixed with hydrochloric acid it becomes aqua regia, which dissolves gold.',
    itemsZh: ['硝酸铵化肥', '炸药与火箭推进剂', '王水（溶解金铂）', '金属蚀刻与电子清洗'],
    itemsEn: ['Ammonium nitrate fertiliser', 'Explosives and rocket propellants', 'Aqua regia', 'Metal etching'],
  },

  // ---- 有机物 ----
  ch4: {
    zh: '天然气的主要成分，家里的燃气灶和热水器烧的就是它；也是仅次于二氧化碳的温室气体。',
    en: 'The main component of natural gas that burns in your hob and water heater, and the second most important greenhouse gas after CO2.',
    itemsZh: ['家用天然气与燃气灶', '燃气发电与供暖', '制氢与合成氨原料', '沼气与温室气体'],
    itemsEn: ['Domestic gas cooking', 'Gas power and heating', 'Feedstock for hydrogen and ammonia', 'Biogas and greenhouse gas'],
  },
  ch2o: {
    zh: '福尔马林（甲醛水溶液）用于保存标本；但人造板和家具胶粘剂释放的甲醛是最受关注的室内污染物。',
    en: 'Formalin preserves biological specimens, but the formaldehyde released by engineered wood and furniture adhesives is the most-watched indoor pollutant.',
    itemsZh: ['福尔马林标本保存', '人造板与家具胶粘剂', '室内空气污染检测对象', '消毒与疫苗灭活'],
    itemsEn: ['Formalin specimen preservation', 'Adhesives in engineered wood', 'A key indoor-air pollutant', 'Disinfection and vaccine inactivation'],
  },
  c2h2: {
    zh: '氧炔焰能达到约 3300 ℃，是少数能熔断厚钢板的火焰；也用作水果的人工催熟剂。',
    en: 'An oxyacetylene flame reaches about 3300 °C, one of the few hot enough to cut thick steel; it is also used to ripen fruit artificially.',
    itemsZh: ['氧炔焊接与金属切割', '水果人工催熟', '合成橡胶与塑料原料'],
    itemsEn: ['Oxyacetylene welding and cutting', 'Artificial fruit ripening', 'Feedstock for rubber and plastics'],
  },
  c2h4: {
    zh: '产量最大的有机化工产品，聚乙烯（塑料袋、保鲜膜）就由它聚合而成；同时也是植物自身的催熟激素。',
    en: 'The most-produced organic chemical: polyethylene (carrier bags, cling film) is polymerised from it — and it is also the plant hormone that ripens fruit.',
    itemsZh: ['聚乙烯塑料袋与保鲜膜', '香蕉等水果催熟', '防冻液与化工原料', '合成纤维'],
    itemsEn: ['Polyethylene bags and cling film', 'Ripening bananas and other fruit', 'Antifreeze and chemical feedstock', 'Synthetic fibres'],
  },
  ch3oh: {
    zh: '外观和气味都像乙醇，却会代谢成甲酸导致失明甚至死亡 —— 假酒中毒的元凶正是它。',
    en: 'It looks and smells like ethanol but metabolises into formic acid, causing blindness or death — the culprit behind bootleg-liquor poisonings.',
    itemsZh: ['甲醇燃料与生物柴油', '玻璃水与防冻液', '甲醛与塑料原料', '假酒中毒的元凶'],
    itemsEn: ['Methanol fuel and biodiesel', 'Windscreen washer and antifreeze', 'Feedstock for formaldehyde', 'Cause of bootleg-alcohol poisoning'],
  },
  c2h5oh: {
    zh: '75% 浓度杀菌效果最好 —— 太浓会让细菌表面蛋白迅速凝固，反而挡住酒精继续渗入。',
    en: 'It disinfects best at 75%: any stronger and it coagulates surface proteins so fast that the seal blocks further penetration.',
    itemsZh: ['医用消毒酒精与免洗洗手液', '酒精饮料', '燃料乙醇（乙醇汽油）', '香精与药物溶剂'],
    itemsEn: ['Medical alcohol and hand sanitiser', 'Alcoholic drinks', 'Fuel ethanol', 'Solvent for flavours and drugs'],
  },
  c6h6: {
    zh: '塑料、合成纤维、染料和药物的基础原料之一，但已确认为致癌物，工业接触受严格管控。',
    en: 'A base feedstock for plastics, synthetic fibres, dyes and drugs — but a confirmed carcinogen, so industrial exposure is tightly controlled.',
    itemsZh: ['塑料与合成纤维原料', '染料与药物中间体', '汽油组分', '确认致癌物，接触受管控'],
    itemsEn: ['Feedstock for plastics and fibres', 'Dye and drug intermediates', 'Petrol component', 'A regulated carcinogen'],
  },
  c2h6: {
    zh: '天然气中含量第二的成分。工业上主要被裂解成乙烯 —— 也就是变成塑料的第一步。',
    en: 'The second most abundant component of natural gas. Industrially it is cracked into ethylene, the first step towards plastic.',
    itemsZh: ['裂解制乙烯（塑料原料）', '天然气组分与燃料', '制冷剂'],
    itemsEn: ['Cracked to ethylene for plastics', 'Natural gas component and fuel', 'Refrigerant'],
  },
  c3h8: {
    zh: '液化石油气（LPG）的主要成分，加压即可液化装罐，是野外烧烤炉、热气球和无管道地区的主要燃料。',
    en: 'The main component of LPG: it liquefies under modest pressure, fuelling camping stoves, hot-air balloons and homes off the gas grid.',
    itemsZh: ['液化石油气罐（煤气罐）', '户外烧烤炉与热气球', '打火机燃料', '乡村供暖与炊事'],
    itemsEn: ['LPG cylinders', 'Camping stoves and balloons', 'Lighter fuel', 'Off-grid heating and cooking'],
  },
  ch3cl: {
    zh: '有机硅工业的起点 —— 硅橡胶、硅油和防水密封胶都从它开始合成；曾作制冷剂，因毒性淘汰。',
    en: 'The starting point of the silicone industry — silicone rubber, oils and waterproof sealants all begin here; once a refrigerant, dropped for toxicity.',
    itemsZh: ['硅橡胶与硅油生产起点', '防水密封胶原料', '早期制冷剂（已淘汰）'],
    itemsEn: ['Start of silicone manufacture', 'Feedstock for sealants', 'Early refrigerant (obsolete)'],
  },
  chcl3: {
    zh: '19 世纪最重要的吸入麻醉剂，但因肝毒性和心律失常风险早已被淘汰；如今主要作实验室溶剂和制冷剂原料。',
    en: 'The leading inhaled anaesthetic of the 19th century, long abandoned for liver toxicity and cardiac risk; today mainly a lab solvent and refrigerant precursor.',
    itemsZh: ['实验室萃取溶剂', '特氟龙制冷剂原料', '历史上的吸入麻醉剂'],
    itemsEn: ['Laboratory extraction solvent', 'Precursor for PTFE refrigerants', 'Historic anaesthetic'],
  },
  ccl4: {
    zh: '曾是最常见的灭火剂和干洗溶剂，后来发现它既伤肝又破坏臭氧层，已被《蒙特利尔议定书》全面禁用。',
    en: 'Once the most common fire extinguisher and dry-cleaning solvent, until it proved both hepatotoxic and ozone-depleting; now banned under the Montreal Protocol.',
    itemsZh: ['曾用作灭火剂与干洗剂（已禁用）', '曾用于制冷剂生产', '化学教学的经典非极性分子'],
    itemsEn: ['Former extinguisher and dry-cleaning solvent (banned)', 'Former refrigerant feedstock', 'A teaching classic for non-polar molecules'],
  },
  ch3cho: {
    zh: '酒精在肝脏代谢的第一步产物。亚洲人中约四成乙醛脱氢酶活性偏低，喝酒脸红正是乙醛堆积所致。',
    en: 'The first product of alcohol metabolism. Roughly 40% of East Asians have a low-activity variant of the enzyme that clears it, which is why drinking makes them flush.',
    itemsZh: ['酒精代谢中间产物（脸红与宿醉）', '香精与香料合成', '树脂与塑料原料'],
    itemsEn: ['Alcohol metabolite behind flushing and hangovers', 'Flavour and fragrance synthesis', 'Resin and plastics feedstock'],
  },
  acetone: {
    zh: '洗甲水的主要成分，也是溶解油脂和树脂能力极强的常用溶剂；人体在长时间断食时也会产生它。',
    en: 'The main ingredient of nail-polish remover and a powerful solvent for oils and resins; the body also produces it during prolonged fasting.',
    itemsZh: ['洗甲水', '实验室与工业溶剂', '有机玻璃（亚克力）原料', '糖尿病酮症的代谢产物'],
    itemsEn: ['Nail-polish remover', 'Lab and industrial solvent', 'Feedstock for acrylic glass', 'Metabolite in ketosis'],
  },
  ch3cooh: {
    zh: '食醋中约含 3–5% 的乙酸，酸味就来自它；家用除水垢、清洁玻璃也常用白醋。',
    en: 'Vinegar is 3-5% acetic acid, and that is where the sourness comes from; white vinegar is also a household descaler and glass cleaner.',
    itemsZh: ['食醋与调味', '家用除水垢与清洁', '醋酸纤维与涤纶原料', '食品防腐剂'],
    itemsEn: ['Vinegar and seasoning', 'Household descaling', 'Acetate fibre and polyester feedstock', 'Food preservative'],
  },
  ch3och3: {
    zh: '与乙醇分子式相同却性质迥异，是同分异构的经典范例。作气雾剂推进剂和清洁柴油替代燃料。',
    en: 'Same formula as ethanol yet completely different — the textbook case of structural isomerism. Used as an aerosol propellant and a clean diesel substitute.',
    itemsZh: ['喷雾罐推进剂', '清洁柴油替代燃料', '化学教学的同分异构范例'],
    itemsEn: ['Aerosol propellant', 'Clean diesel substitute', 'Teaching example of isomerism'],
  },
  toluene: {
    zh: '油漆稀释剂和胶水的主要溶剂，也是 TNT 炸药的原料；挥发性强，长期吸入会损伤神经系统。',
    en: 'The main solvent in paint thinners and adhesives, and the raw material for TNT; volatile enough that chronic inhalation damages the nervous system.',
    itemsZh: ['油漆稀释剂与胶水溶剂', 'TNT 炸药原料', '汽油辛烷值提升剂', '指甲油与印刷油墨'],
    itemsEn: ['Paint thinner and adhesive solvent', 'Raw material for TNT', 'Octane booster in petrol', 'Nail polish and printing inks'],
  },
  phenol: {
    zh: '历史上第一种外科消毒剂 —— 李斯特用它把手术死亡率大幅降低；今天则是酚醛树脂和多种药物的原料。',
    en: 'The first surgical antiseptic: Lister used it to cut operative mortality dramatically. Today it is the feedstock for phenolic resins and many drugs.',
    itemsZh: ['最早的外科消毒剂', '酚醛树脂（电木、层压板）', '阿司匹林等药物原料', '喉痛喷雾中的局部麻醉成分'],
    itemsEn: ['The first surgical antiseptic', 'Phenolic resins and laminates', 'Feedstock for aspirin and other drugs', 'Throat-spray anaesthetic'],
  },
  naphthalene: {
    zh: '传统樟脑丸的成分，靠常温升华出的蒸气驱虫；因健康顾虑，许多国家已改用其他防蛀剂。',
    en: 'The active ingredient of old-fashioned mothballs, working through vapour that sublimes at room temperature; health concerns have pushed many countries to alternatives.',
    itemsZh: ['樟脑丸防蛀', '染料与增塑剂原料', '混凝土减水剂', '曾用于家用驱虫'],
    itemsEn: ['Mothballs', 'Dye and plasticiser feedstock', 'Concrete water reducers', 'Former household insect repellent'],
  },
  urea: {
    zh: '用量最大的氮肥。护肤品里的尿素能锁水软化角质；柴油车加的"车用尿素"则用来分解尾气中的氮氧化物。',
    en: 'The world’s leading nitrogen fertiliser. In skincare it holds water and softens keratin; in diesel vehicles, AdBlue urea solution breaks down exhaust NOx.',
    itemsZh: ['尿素氮肥', '护肤品保湿与去角质', '柴油车尾气处理液（车用尿素）', '人体尿液的主要含氮废物'],
    itemsEn: ['Urea fertiliser', 'Moisturising and keratolytic skincare', 'AdBlue diesel exhaust fluid', 'The main nitrogen waste in urine'],
  },
  glycine: {
    zh: '组成蛋白质的 20 种氨基酸中最小的一个，因为侧链只是一个氢原子，能挤进胶原蛋白紧密的三股螺旋里。',
    en: 'The smallest of the 20 protein amino acids: its side chain is a single hydrogen, small enough to fit inside collagen’s tight triple helix.',
    itemsZh: ['蛋白质与胶原蛋白的组成单元', '食品增味剂与缓冲剂', '中枢神经抑制性递质', '生化实验缓冲液'],
    itemsEn: ['Building block of proteins and collagen', 'Food flavour enhancer and buffer', 'Inhibitory neurotransmitter', 'Biochemical buffers'],
  },
}
