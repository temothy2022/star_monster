export type PackingTipPriority = "ESSENTIAL" | "RECOMMENDED";
export type PackingTipStatus = "NOT_LISTED" | "UNPACKED" | "OUT_OF_STOCK" | "EXPIRED";

type PackingTipTemplate = {
  id: string;
  category: string;
  label: string;
  priority: PackingTipPriority;
  keywords: string[];
  excludeKeywords?: string[];
};

type PackingItemForTips = {
  label: string;
  quantity: number;
  packed: boolean;
  expirationDate: string | null;
};

export const FAMILY_TRAVEL_PACKING_TIPS: PackingTipTemplate[] = [
  { id: "adult-id", category: "证件与出行", label: "大人身份证件", priority: "ESSENTIAL", keywords: ["身份证", "身份证件", "证件"] },
  { id: "child-id", category: "证件与出行", label: "孩子身份证或户口本", priority: "ESSENTIAL", keywords: ["孩子身份证", "儿童身份证", "户口本", "户口簿", "出生证明"] },
  { id: "tickets", category: "证件与出行", label: "车票、机票或预订信息", priority: "ESSENTIAL", keywords: ["车票", "机票", "登机牌", "登机信息", "预订信息", "酒店订单", "行程单"] },
  { id: "wallet", category: "证件与出行", label: "钱包、银行卡与少量现金", priority: "ESSENTIAL", keywords: ["钱包", "银行卡", "现金", "零钱"] },
  { id: "keys", category: "证件与出行", label: "家门钥匙和车钥匙", priority: "ESSENTIAL", keywords: ["钥匙", "家门钥匙", "车钥匙"] },
  { id: "passport", category: "证件与出行", label: "护照和签证（出境时）", priority: "RECOMMENDED", keywords: ["护照", "签证", "港澳通行证", "通行证"] },
  { id: "insurance-card", category: "证件与出行", label: "医保卡或电子医保凭证", priority: "RECOMMENDED", keywords: ["医保卡", "医保凭证", "医疗保险卡", "社保卡"] },

  { id: "child-water", category: "孩子随身用品", label: "孩子水杯", priority: "ESSENTIAL", keywords: ["孩子水杯", "儿童水杯", "水杯", "保温杯", "吸管杯"] },
  { id: "snacks", category: "孩子随身用品", label: "孩子常吃的零食", priority: "RECOMMENDED", keywords: ["零食", "饼干", "小面包", "果泥", "辅食", "奶粉", "瓶装奶", "常温奶", "牛奶", "酸奶"] },
  { id: "wet-wipes", category: "孩子随身用品", label: "湿巾", priority: "ESSENTIAL", keywords: ["湿巾", "湿纸巾", "手口湿巾"] },
  { id: "tissues", category: "孩子随身用品", label: "纸巾", priority: "ESSENTIAL", keywords: ["纸巾", "抽纸", "面巾纸", "手帕纸"] },
  { id: "child-change", category: "孩子随身用品", label: "孩子备用衣裤", priority: "ESSENTIAL", keywords: ["孩子备用衣", "儿童备用衣", "孩子换洗衣", "儿童换洗衣", "备用衣裤"] },
  { id: "underwear", category: "孩子随身用品", label: "备用内裤", priority: "RECOMMENDED", keywords: ["内裤", "底裤", "训练裤"] },
  { id: "child-socks", category: "孩子随身用品", label: "孩子备用袜子", priority: "RECOMMENDED", keywords: ["孩子袜", "儿童袜", "备用袜", "袜子"] },
  { id: "comfort-item", category: "孩子随身用品", label: "安抚玩具或绘本", priority: "RECOMMENDED", keywords: ["安抚玩具", "玩具", "绘本", "故事书", "安抚巾", "毛绒玩具", "水画册", "涂色书", "画册", "画板", "孩子枕头", "儿童枕头", "安抚枕", "枕头"] },
  { id: "diapers", category: "孩子随身用品", label: "纸尿裤和隔尿垫（低龄孩子）", priority: "RECOMMENDED", keywords: ["纸尿裤", "尿不湿", "拉拉裤", "隔尿垫"] },
  { id: "stroller", category: "孩子随身用品", label: "婴儿车或背带（需要时）", priority: "RECOMMENDED", keywords: ["婴儿车", "推车", "遛娃车", "背带", "腰凳"] },
  { id: "bib", category: "孩子随身用品", label: "围兜和便携餐具（需要时）", priority: "RECOMMENDED", keywords: ["围兜", "围嘴", "餐具", "儿童餐具", "辅食剪"] },

  { id: "fever-medicine", category: "药品与急救", label: "儿童退烧药", priority: "ESSENTIAL", keywords: ["儿童退烧药", "退烧药", "退热药", "布洛芬", "对乙酰氨基酚", "美林", "泰诺林", "儿童泰诺", "小儿泰诺"], excludeKeywords: ["成人"] },
  { id: "thermometer", category: "药品与急救", label: "体温计", priority: "ESSENTIAL", keywords: ["体温计", "温度计", "额温枪", "耳温枪"] },
  { id: "bandages", category: "药品与急救", label: "创可贴和纱布", priority: "ESSENTIAL", keywords: ["创可贴", "创口贴", "纱布", "绷带", "伤口喷膜", "伤口保护膜", "液体创可贴"] },
  { id: "disinfectant", category: "药品与急救", label: "碘伏或消毒棉签", priority: "ESSENTIAL", keywords: ["碘伏", "消毒棉签", "酒精棉片", "消毒液", "创面消毒", "伤口消毒"] },
  { id: "allergy-medicine", category: "药品与急救", label: "儿童抗过敏药", priority: "RECOMMENDED", keywords: ["抗过敏药", "过敏药", "西替利嗪", "西地利嗪", "氯雷他定", "艾洛松", "过敏眼药水"] },
  { id: "stomach-medicine", category: "药品与急救", label: "肠胃或止泻药", priority: "RECOMMENDED", keywords: ["肠胃药", "止泻药", "蒙脱石散", "益生菌", "口服补液盐"] },
  { id: "motion-sickness", category: "药品与急救", label: "晕车药或晕车贴", priority: "RECOMMENDED", keywords: ["晕车药", "晕车贴", "防晕车"] },
  { id: "prescription", category: "药品与急救", label: "孩子日常处方药", priority: "ESSENTIAL", keywords: ["处方药", "日常药", "常用药", "长期用药", "奥司他韦", "玛巴洛沙韦", "速福达", "莫西沙星"] },
  { id: "mosquito", category: "药品与急救", label: "驱蚊和止痒用品", priority: "RECOMMENDED", keywords: ["驱蚊", "蚊香液", "驱蚊液", "驱蚊贴", "止痒", "炉甘石"] },

  { id: "adult-clothes", category: "衣物与洗护", label: "大人换洗衣物", priority: "ESSENTIAL", keywords: ["大人换洗衣", "成人换洗衣", "换洗衣物", "备用衣物"] },
  { id: "pajamas", category: "衣物与洗护", label: "睡衣", priority: "RECOMMENDED", keywords: ["睡衣", "睡裤"] },
  { id: "jacket", category: "衣物与洗护", label: "薄外套或保暖衣物", priority: "RECOMMENDED", keywords: ["外套", "薄外套", "保暖衣", "冲锋衣", "毛衣"] },
  { id: "shoes", category: "衣物与洗护", label: "备用鞋或拖鞋", priority: "RECOMMENDED", keywords: ["备用鞋", "拖鞋", "凉鞋", "雨鞋"] },
  { id: "sun-hat", category: "衣物与洗护", label: "孩子遮阳帽", priority: "RECOMMENDED", keywords: ["遮阳帽", "太阳帽", "孩子帽", "儿童帽"] },
  { id: "rain-gear", category: "衣物与洗护", label: "雨伞或儿童雨衣", priority: "RECOMMENDED", keywords: ["雨伞", "雨衣", "儿童雨衣"] },
  { id: "toothbrush", category: "衣物与洗护", label: "牙刷和牙膏", priority: "RECOMMENDED", keywords: ["牙刷", "牙膏", "洗漱包"] },
  { id: "towel", category: "衣物与洗护", label: "毛巾或浴巾", priority: "RECOMMENDED", keywords: ["毛巾", "浴巾", "洗脸巾"] },
  { id: "sunscreen", category: "衣物与洗护", label: "儿童防晒霜", priority: "RECOMMENDED", keywords: ["防晒", "防晒霜", "儿童防晒"] },
  { id: "sanitizer", category: "衣物与洗护", label: "免洗洗手液", priority: "RECOMMENDED", keywords: ["洗手液", "免洗洗手液", "消毒凝胶", "酒精消毒喷雾", "免洗消毒喷雾"] },
  { id: "masks", category: "衣物与洗护", label: "大人和儿童口罩", priority: "RECOMMENDED", keywords: ["口罩", "儿童口罩"] },
  { id: "trash-bags", category: "衣物与洗护", label: "垃圾袋或密封袋", priority: "RECOMMENDED", keywords: ["垃圾袋", "密封袋", "保鲜袋", "脏衣袋"] },

  { id: "phone", category: "电子设备", label: "手机", priority: "ESSENTIAL", keywords: ["手机", "电话"], excludeKeywords: ["防水袋", "手机壳", "保护壳", "支架", "三脚架", "挂绳", "贴膜", "联系卡", "随身卡", "电话卡", "电话手环"] },
  { id: "charger", category: "电子设备", label: "充电器和充电线", priority: "ESSENTIAL", keywords: ["充电器", "充电线", "数据线", "快充头"] },
  { id: "power-bank", category: "电子设备", label: "充电宝", priority: "RECOMMENDED", keywords: ["充电宝", "移动电源"] },
  { id: "headphones", category: "电子设备", label: "儿童耳机（长途时）", priority: "RECOMMENDED", keywords: ["儿童耳机", "耳机"] },

  { id: "contact-card", category: "安全与应急", label: "写有联系电话的孩子随身卡", priority: "RECOMMENDED", keywords: ["联系卡", "联系电话卡", "防走失卡", "姓名牌", "电话手环"] },
  { id: "car-seat", category: "安全与应急", label: "儿童安全座椅（乘车时）", priority: "ESSENTIAL", keywords: ["安全座椅", "儿童座椅", "增高垫"] },
  { id: "flashlight", category: "安全与应急", label: "小手电或应急灯", priority: "RECOMMENDED", keywords: ["手电", "手电筒", "应急灯"] },
] as const;

function normalized(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function matches(template: PackingTipTemplate, item: PackingItemForTips) {
  const label = normalized(item.label);
  if (template.excludeKeywords?.some((keyword) => label.includes(normalized(keyword)))) return false;
  return template.keywords.some((keyword) => {
    const candidate = normalized(keyword);
    return label.includes(candidate) || (label.length >= 2 && candidate.includes(label));
  });
}

export function checkFamilyTravelPacking(items: PackingItemForTips[], today = new Date().toISOString().slice(0, 10)) {
  const attention = FAMILY_TRAVEL_PACKING_TIPS.flatMap((template) => {
    const matched = items.filter((item) => matches(template, item));
    if (matched.some((item) => item.packed && item.quantity > 0 && (!item.expirationDate || item.expirationDate >= today))) return [];

    let status: PackingTipStatus = "NOT_LISTED";
    const usable = matched.filter((item) => !item.expirationDate || item.expirationDate >= today);
    if (usable.some((item) => item.quantity > 0)) status = "UNPACKED";
    else if (usable.some((item) => item.quantity === 0)) status = "OUT_OF_STOCK";
    else if (matched.length > 0) status = "EXPIRED";
    return [{ id: template.id, category: template.category, label: template.label, priority: template.priority, status }];
  });

  const categoryOrder = [...new Set(FAMILY_TRAVEL_PACKING_TIPS.map((item) => item.category))];
  return {
    summary: {
      total: FAMILY_TRAVEL_PACKING_TIPS.length,
      ready: FAMILY_TRAVEL_PACKING_TIPS.length - attention.length,
      attention: attention.length,
    },
    groups: categoryOrder.map((name) => ({
      name,
      items: attention.filter((item) => item.category === name),
    })).filter((group) => group.items.length > 0),
  };
}
