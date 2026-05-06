/**
 * Canonical English → Chinese mappings for schools whose Chinese name
 * the LLM commonly mis-translates. Keyed by the normalized English name
 * (lowercased, parenthetical content removed, leading "The" stripped,
 * whitespace collapsed).
 *
 * Source: 2026 QS 全球大学排名 list provided by the user. Do not edit
 * Chinese names without explicit user confirmation — that table is the
 * agreed source of truth for canonical naming in this product.
 */

const RAW_OVERRIDES: ReadonlyArray<readonly [string, string]> = [
  ["Massachusetts Institute of Technology (MIT)", "麻省理工学院"],
  ["Imperial College London", "帝国理工学院"],
  ["Stanford University", "斯坦福大学"],
  ["University of Oxford", "牛津大学"],
  ["Harvard University", "哈佛大学"],
  ["University of Cambridge", "剑桥大学"],
  ["ETH Zurich (Swiss Federal Institute of Technology)", "苏黎世联邦理工大学"],
  ["National University of Singapore (NUS)", "新加坡国立大学"],
  ["UCL (University College London)", "伦敦大学学院"],
  ["California Institute of Technology (Caltech)", "加州理工大学"],
  ["The University of Hong Kong", "香港大学"],
  ["Nanyang Technological University, Singapore (NTU Singapore)", "南洋理工大学"],
  ["University of Chicago", "芝加哥大学"],
  ["Peking University", "北京大学"],
  ["University of Pennsylvania", "宾夕法尼亚大学"],
  ["Cornell University", "康奈尔大学"],
  ["Tsinghua University", "清华大学"],
  ["University of California, Berkeley (UCB)", "加州大学伯克利分校"],
  ["The University of Melbourne", "墨尔本大学"],
  ["The University of New South Wales", "新南威尔士大学"],
  ["Yale University", "耶鲁大学"],
  ["École Polytechnique Fédérale de Lausanne", "洛桑联邦理工学院"],
  ["Technical University of Munich", "慕尼黑工业大学"],
  ["Johns Hopkins University", "约翰霍普金斯大学"],
  ["Princeton University", "普林斯顿大学"],
  ["The University of Sydney", "悉尼大学"],
  ["McGill University", "麦吉尔大学"],
  ["PSL University", "巴黎科学艺术人文大学"],
  ["University of Toronto", "多伦多大学"],
  ["Fudan University", "复旦大学"],
  ["King's College London (KCL)", "伦敦国王学院"],
  ["Australian National University", "澳大利亚国立大学（ANU）"],
  ["The Chinese University of Hong Kong", "香港中文大学"],
  ["University of Edinburgh", "爱丁堡大学"],
  ["The University of Manchester", "曼彻斯特大学"],
  ["Monash University", "蒙纳士大学"],
  ["The University of Tokyo", "东京大学"],
  ["Columbia University", "哥伦比亚大学"],
  ["Seoul National University", "首尔国立大学"],
  ["University of British Columbia", "不列颠哥伦比亚大学"],
  ["Institut Polytechnique de Paris", "巴黎理工学院"],
  ["Northwestern University", "西北大学"],
  ["The University of Queensland", "昆士兰大学"],
  ["The Hong Kong University of Science and Technology", "香港科技大学（HKUST）"],
  ["University of Michigan-Ann Arbor", "密歇根大学"],
  ["University of California, Los Angeles (UCLA)", "加州大学洛杉矶分校"],
  ["Delft University of Technology", "代尔夫特理工大学"],
  ["Shanghai Jiao Tong University", "上海交通大学"],
  ["Zhejiang University", "浙江大学"],
  ["Yonsei University", "延世大学"],
  ["University of Bristol", "布里斯托大学"],
  ["Carnegie Mellon University", "卡内基梅隆大学"],
  ["The University of Amsterdam", "阿姆斯特丹大学"],
  ["The Hong Kong Polytechnic University", "香港理工大学"],
  ["New York University (NYU)", "纽约大学（NYU）"],
  ["London School of Economics and Political Science (LSE)", "伦敦经济政治学院"],
  ["Kyoto University", "京都大学"],
  ["Ludwig-Maximilians-Universität München", "路德维希 - 马克西米利安 - 慕尼黑大学"],
  ["Universiti Malaya (UM)", "马来亚大学（UM）"],
  ["KU Leuven", "鲁汶大学"],
  ["Korea University", "高丽大学"],
  ["Duke University", "杜克大学"],
  ["City University of Hong Kong", "香港城市大学"],
  ["National Taiwan University (NTU)", "中国台湾大学"],
  ["The University of Auckland", "奥克兰大学"],
  ["University of California, San Diego (UCSD)", "加州大学圣地亚哥分校"],
  ["King Fahd University of Petroleum & Minerals", "法赫德法国石油和矿物大学（KFUPM）"],
  ["University of Texas at Austin", "德克萨斯大学奥斯汀分校"],
  ["Brown University", "布朗大学"],
  ["Université Paris-Saclay", "巴黎萨克雷大学"],
  ["University of Illinois at Urbana-Champaign", "伊利诺伊大学香槟分校"],
  ["Lund University", "隆德大学"],
  ["Sorbonne University (merged from Paris IV & UPMC)", "索邦大学"],
  ["The University of Warwick", "华威大学"],
  ["Trinity College Dublin, The University of Dublin", "都柏林三一学院"],
  ["University of Birmingham", "伯明翰大学"],
  ["The University of Western Australia", "西澳大学（UWA）"],
  ["KTH Royal Institute of Technology", "皇家理工学院"],
  ["University of Glasgow", "格拉斯哥大学"],
  ["Ruprecht-Karls-Universität Heidelberg", "鲁普莱希特-卡尔斯-海德堡大学"],
  ["University of Washington", "华盛顿大学"],
  ["Adelaide University", "阿德莱德大学"],
  ["Pennsylvania State University", "宾夕法尼亚州立大学"],
  ["Universidad de Buenos Aires", "布宜诺斯艾利斯大学"],
  ["Tokyo Institute of Technology", "东京工业大学"],
  ["University of Leeds", "利兹大学"],
  ["University of Southampton", "南安普敦大学"],
  ["Boston University", "波士顿大学"],
  ["Freie Universität Berlin", "柏林自由大学"],
  ["Purdue University", "普渡大学"],
  ["The University of Osaka", "大阪大学"],
  ["The University of Sheffield", "谢菲尔德大学"],
  ["Uppsala University", "乌普萨拉大学"],
  ["Durham University", "杜伦大学"],
  ["University of Alberta", "阿尔伯塔大学"],
  ["University of Technology Sydney", "悉尼科技大学（UTS）"],
  ["The University of Nottingham", "诺丁汉大学"],
  ["Karlsruhe Institute of Technology (KIT)", "卡尔斯鲁厄理工学院"],
  ["Politecnico di Milano", "米兰理工大学"],
  ["University of Zurich (UZH)", "苏黎世大学"],
  ["University of Copenhagen", "哥本哈根大学"],
  ["Pohang University of Science And Technology (POSTECH)", "浦项科技大学"],
  ["Nanjing University", "南京大学"],
  ["Utrecht University", "乌得勒支大学"],
  ["Lomonosov Moscow State University", "罗蒙诺索夫莫斯科国立大学"],
  ["Rheinisch-Westfälische Technische Hochschule Aachen", "亚琛工业大学"],
  ["Technical University of Denmark", "丹麦技术大学"],
  ["Universidade de São Paulo (USP)", "圣保罗大学"],
  ["Tohoku University", "东北大学"],
  ["Queen Mary University of London (QMUL)", "伦敦大学皇后玛丽学院"],
  ["University of Wisconsin-Madison", "威斯康星大学麦迪逊分校"],
  ["Qatar University", "卡塔尔大学"],
  ["University of St Andrews", "圣安德鲁斯大学"],
  ["Aalto University", "阿托大学"],
  ["University of California, Davis", "加州大学戴维斯分校"],
  ["Pontificia Universidad Católica de Chile", "智利天主教大学"],
  ["University of Helsinki", "赫尔辛基大学"],
  ["University College Dublin", "都柏林大学"],
  ["Leiden University", "莱顿大学"],
  ["Rice University", "赖斯大学"],
  ["University of Oslo", "奥斯陆大学"],
  ["University of Waterloo", "滑铁卢大学"],
  ["Georgia Institute of Technology", "乔治亚理工学院"],
  ["Indian Institute of Technology Delhi (IITD)", "印度理工学院德里分校"],
  ["RMIT University", "皇家墨尔本理工大学"],
  ["Sungkyunkwan University", "成均馆大学"],
  ["Universiti Kebangsaan Malaysia (UKM)", "马来西亚国立大学（UKM）"],
  ["Sapienza University of Rome", "萨皮恩扎 - 罗马大学"],
  ["Indian Institute of Technology Bombay (IITB)", "印度理工学院孟买分校"],
  ["Humboldt-Universität zu Berlin", "柏林洪堡大学"],
  ["Aarhus University", "奥胡斯大学"],
  ["University of Bath", "巴斯大学"],
  ["University of Science and Technology of China", "中国科学技术大学"],
  ["Universiti Putra Malaysia (UPM)", "马来西亚博特拉大学（UPM）"],
  ["Universiti Sains Malaysia (USM)", "马来西亚理科大学（USM）"],
  ["Universidad Nacional Autónoma de México (UNAM)", "墨西哥国立自治大学"],
  ["Newcastle University", "纽卡斯尔大学"],
  ["Alma Mater Studiorum - University of Bologna", "博洛尼亚大学"],
  ["Macquarie University", "麦考瑞大学"],
  ["Eindhoven University of Technology", "埃因霍温理工大学"],
  ["Erasmus University Rotterdam", "鹿特丹伊拉斯姆斯大学"],
  ["University of North Carolina, Chapel Hill", "北卡罗来纳大学教堂山"],
  ["King Saud University", "沙特国王大学（KSU）"],
  ["Texas A&M University", "德州农工大学"],
  ["Technische Universität Berlin", "柏林工业大学"],
  ["University of Southern California", "南加州大学"],
  ["Stockholm University", "斯德哥尔摩大学"],
  ["University of Groningen", "格罗宁根大学"],
  ["University of Liverpool", "利物浦大学"],
  ["University of Cape Town", "开普敦大学"],
  ["Western University", "韦仕敦大学（西安大略大学）"],
  ["University of Vienna", "维也纳大学"],
  ["Universiti Teknologi Malaysia (UTM)", "马来西亚工艺大学（UTM）"],
  ["Wageningen University & Research", "瓦赫宁根大学"],
  ["University of Exeter", "埃克塞特大学"],
  ["University of Geneva", "日内瓦大学"],
  ["Lancaster University", "兰卡斯特大学"],
  ["University of Basel", "巴塞尔大学"],
  ["Hanyang University", "汉阳大学"],
  ["University of Barcelona", "巴塞罗那大学"],
  ["Michigan State University", "密歇根州立大学"],
  ["Ghent University", "根特大学"],
  ["King Abdul Aziz University (KAU)", "阿卜杜勒·阿齐兹国王大学"],
  ["Nagoya University", "名古屋大学"],
  ["Chalmers University of Technology", "查尔姆斯理工大学"],
  ["Al-Farabi Kazakh National University", "哈萨克国立大学"],
  ["Washington University in St. Louis", "华盛顿大学在圣路易斯"],
  ["University of Montreal", "蒙特利尔大学"],
  ["University of York", "约克大学"],
  ["Hokkaido University", "北海道大学"],
  ["Kyushu University", "九州大学"],
  ["Universitat Autònoma de Barcelona", "巴塞罗那自治大学"],
  ["Arizona State University", "亚利桑那州立大学"],
  ["McMaster University", "麦克马斯特大学"],
  ["Universidad de Chile", "智利大学"],
  ["National Tsing Hua University", "国立清华大学"],
];

/**
 * Normalize an English school name into a stable lookup key:
 * - lowercase
 * - strip parenthetical content (English `()` and Chinese `（）`)
 * - drop a leading "The "
 * - collapse whitespace
 *
 * Done at both build time (when populating the override map) and at
 * lookup time, so the LLM emitting "Imperial College London" or
 * "Imperial College London (Imperial)" or "  the imperial college
 * london  " all hit the same canonical entry.
 */
function normalizeKey(s: string): string {
  return s
    .replace(/[(（][^)）]*[)）]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const SCHOOL_NAME_OVERRIDES: Record<string, string> = Object.fromEntries(
  RAW_OVERRIDES.map(([en, zh]) => [normalizeKey(en), zh]),
);

/**
 * Look up the canonical Chinese name for a school by its English name.
 * Returns undefined if no override is registered.
 */
export function lookupSchoolZh(school: string | undefined): string | undefined {
  if (!school) return undefined;
  return SCHOOL_NAME_OVERRIDES[normalizeKey(school)];
}
