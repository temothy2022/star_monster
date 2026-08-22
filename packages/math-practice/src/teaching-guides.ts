import type { MathQuestionTypeId } from "./question-types.js";

export type MathHintVisual =
  | "COUNT"
  | "NUMBER_PATH"
  | "DIRECTION"
  | "COMPARE"
  | "PLACE_VALUE"
  | "PART_WHOLE"
  | "STORY_CHANGE"
  | "ELIMINATION"
  | "LAYERS";

export type MathTeachingGuide = {
  focus: string;
  commonMistake: string;
  hints: readonly [string, string];
  visual: MathHintVisual;
};

/**
 * Final-round teaching audit for every registered question type.
 * Child hints intentionally use the least-help-first sequence: point out where
 * to look first, then name the representation or operation only if needed.
 */
export const MATH_TEACHING_GUIDES_BY_TYPE: Record<MathQuestionTypeId, MathTeachingGuide> = {
  N01: {
    focus: "一一对应计数，并理解最后一个数表示总数。",
    commonMistake: "漏数、重复数，或数完后不知道最后一个数就是总数。",
    hints: ["从一个方向开始点，一个物品只点一次。", "最后点到的数字，就是这一组一共有几个。"],
    visual: "COUNT",
  },
  N02: {
    focus: "先定位指定容器，再在容器内准确计数。",
    commonMistake: "找错题目指定的组，或把相邻容器里的物品也数进去。",
    hints: ["先找到标有对应编号的那一组。", "只数这一组里面的物品，一个一个数。"],
    visual: "COUNT",
  },
  N03: {
    focus: "利用五个或十个一组的结构快速计数。",
    commonMistake: "忽略分组结构，从1开始逐个数，容易漏数。",
    hints: ["先看整齐的一组是5个还是10个。", "记住整组的数，再接着数剩下的。"],
    visual: "COUNT",
  },
  N04: {
    focus: "理解序数，并保持指定计数方向。",
    commonMistake: "把目标前面的数量当作名次，或从错误方向开始。",
    hints: ["先看箭头，确定从哪一边开始。", "第一个也要算1，再数到戴星星的伙伴。"],
    visual: "DIRECTION",
  },
  N05: {
    focus: "依据队伍朝向建立前后关系。",
    commonMistake: "按画面左右判断前后，没有先看队伍前进方向。",
    hints: ["先看队伍前进的箭头，找出前面。", "站到星星伙伴的位置，只数题目问的那一边。"],
    visual: "DIRECTION",
  },
  N06: {
    focus: "从已知数判断数序方向，并识别五格中的固定间隔。",
    commonMistake: "没有先判断顺数或倒数，也没有检查每次相差几。",
    hints: ["先找已知数，看看数字往哪边变。", "检查每一格都增加或减少同样多。"],
    visual: "NUMBER_PATH",
  },
  N07: {
    focus: "识别顺数、倒数和固定步长规律。",
    commonMistake: "只看某两个数，没有检查每一步是否相同。",
    hints: ["先比较相邻两格，每次变了多少。", "用同样的步子继续向前或向后。"],
    visual: "NUMBER_PATH",
  },
  N08: {
    focus: "连接数量大小、数字大小与比较符号。",
    commonMistake: "只记符号外形，没有先比较两边数量。",
    hints: ["先想两个数谁代表的数量更多。", "张开的口朝大数；一样多就填等号。"],
    visual: "COMPARE",
  },
  N09: {
    focus: "逐次选择极值，形成有序数列。",
    commonMistake: "只交换一对数，没有检查整个队伍。",
    hints: ["先找最小的数，放到最左边。", "再从剩下的数里找最小的，依次排。"],
    visual: "NUMBER_PATH",
  },
  N10: {
    focus: "通过一一配对比较多少并求相差量。",
    commonMistake: "只看排列长短或物体大小，没有比较数量。",
    hints: ["把两组物品一个对一个配起来。", "没配上的有几个，就是多出或少掉的几个。"],
    visual: "COMPARE",
  },
  N11: {
    focus: "排除颜色和位置干扰，比较物体本身的大小。",
    commonMistake: "被颜色、位置或造型干扰，没有比较占用空间的大小。",
    hints: ["想象把它们放在一起比一比。", "同时看一看物体的宽和高，找出整体最大的。"],
    visual: "COMPARE",
  },
  N12: {
    focus: "在统一基线下比较物体高矮。",
    commonMistake: "只看物体顶部，没有检查底部是否在同一条线上。",
    hints: ["先看它们是不是站在同一条线上。", "从同一条底线往上看，顶部最高的就是最高。"],
    visual: "COMPARE",
  },
  N13: {
    focus: "在统一起点下比较物体长短。",
    commonMistake: "被摆放位置影响，没有对齐起点。",
    hints: ["把三件物品的起点想象成对齐。", "从同一个起点出发，伸得最远的最长。"],
    visual: "COMPARE",
  },
  N14: {
    focus: "通过跷跷板高低推断轻重关系。",
    commonMistake: "把位置高的一边当成更重。",
    hints: ["看看跷跷板哪一边更低。", "重的一边会往下沉。"],
    visual: "COMPARE",
  },
  N15: {
    focus: "保持指定方向，圈选连续的若干对象。",
    commonMistake: "从错误方向开始，或圈选数量不对。",
    hints: ["先找到题目说的左边或右边。", "从那一边开始，一个一个点，点够题目要求的数量。"],
    visual: "DIRECTION",
  },
  N16: {
    focus: "根据多几或少几构造新的数量。",
    commonMistake: "照抄原数量，或把多和少的方向弄反。",
    hints: ["先数清参考数量有几个。", "多就再添，少就拿掉，再检查相差几个。"],
    visual: "COMPARE",
  },
  P01: {
    focus: "从十捆和单根小棍的图片读出并写出数量。",
    commonMistake: "把一捆当成一个，或颠倒十位和个位。",
    hints: ["先分清一捆表示10，单个表示1。", "先数十，再数一，把它们合起来。"],
    visual: "PLACE_VALUE",
  },
  P02: {
    focus: "旧版看图写数配置的兼容入口。",
    commonMistake: "把一捆当成一个，或颠倒十位和个位。",
    hints: ["先分清一捆表示10，单个表示1。", "先数十，再数一，把它们合起来。"],
    visual: "PLACE_VALUE",
  },
  P03: {
    focus: "理解两位数由几个十和几个一组成。",
    commonMistake: "把十位数字当成个位数量。",
    hints: ["先看左边的十位，它告诉你有几个十。", "再看右边的个位，把几个十和几个一分别填进分支框。"],
    visual: "PART_WHOLE",
  },
  P04: {
    focus: "旧版数位意义配置的兼容入口。",
    commonMistake: "把十位数字当成个位数量。",
    hints: ["先看左边的十位，它告诉你有几个十。", "再看右边的个位，把几个十和几个一分别填进分支框。"],
    visual: "PART_WHOLE",
  },
  P05: {
    focus: "把十位杆、个位杆的珠子转换为两位数。",
    commonMistake: "从错误数位开始读，或忽略空杆上的0。",
    hints: ["先数十位杆，再数个位杆。", "十位珠子写前面，个位珠子写后面。"],
    visual: "PLACE_VALUE",
  },
  P06: {
    focus: "枚举固定珠数在十位和个位间的不同分配。",
    commonMistake: "重复同一种分法，或漏掉全部放在同一数位的情况。",
    hints: ["每颗珠子只能放在十位或个位。", "按“十位几颗、个位几颗”有顺序地试。"],
    visual: "PLACE_VALUE",
  },
  P07: {
    focus: "综合数位条件进行推理并理解添珠变化。",
    commonMistake: "没有区分添在十位和添在个位造成的不同变化。",
    hints: ["把十位条件和个位条件分开看。", "添1颗前，先看它添在十位还是个位。"],
    visual: "PLACE_VALUE",
  },
  C01: {
    focus: "理解加减含义，并从实物策略过渡到数轴策略。",
    commonMistake: "加减方向弄反，或数步数时把起点也算一步。",
    hints: ["加法接着往后数，减法从第一个数往前数。", "在数字路上跳：加几向右几步，减几向左几步。"],
    visual: "NUMBER_PATH",
  },
  C02: {
    focus: "理解连加并灵活利用凑十和交换结合。",
    commonMistake: "漏掉一个加数，或同时算多步导致错误。",
    hints: ["一次只算两个数，再继续加。", "看看有没有两个数能先凑成10。"],
    visual: "NUMBER_PATH",
  },
  C03: {
    focus: "按顺序连续求剩余量。",
    commonMistake: "先把后面的减数相减，改变了原算式含义。",
    hints: ["从左往右，先算第一道减法。", "用上一步的结果继续减。"],
    visual: "NUMBER_PATH",
  },
  C04: {
    focus: "根据数量变化判断加法或减法。",
    commonMistake: "只试符号，不检查等式两边是否相等。",
    hints: ["先看结果比前面的数变大还是变小。", "变大用加号，变小用减号，再算一遍检查。"],
    visual: "NUMBER_PATH",
  },
  C05: {
    focus: "建立整体与部分的可逆关系。",
    commonMistake: "把整体和部分位置弄反。",
    hints: ["上面是整体，下面是两个部分。", "求整体把两部分合起来；求部分就从整体拿走另一部分。"],
    visual: "PART_WHOLE",
  },
  C06: {
    focus: "识别未知数在加减结构中的角色。",
    commonMistake: "看到减号就直接相减，没有先判断空格代表整体还是部分。",
    hints: ["先找清楚，空格是整体还是一个部分。", "求整体用合起来；求部分用整体减已知部分。"],
    visual: "PART_WHOLE",
  },
  C07: {
    focus: "在10以内稳定练习不进位加法和不退位减法。",
    commonMistake: "把个位相加超过10，或减法中小数减大数。",
    hints: ["先看个位，确认加法不超过9、减法够不够减。", "加法接着数，减法从前一个数往回数。"],
    visual: "NUMBER_PATH",
  },
  C08: {
    focus: "在20以内巩固不进位、不退位的两位数加减。",
    commonMistake: "只看总数范围，没有检查个位是否进位或退位。",
    hints: ["先分别看十位和个位。", "个位加不满10、减法够减，就是不进位不退位。"],
    visual: "NUMBER_PATH",
  },
  C09: {
    focus: "在50以内分解十位和个位进行不进位、不退位计算。",
    commonMistake: "把十位和个位混在一起直接算。",
    hints: ["先算个位，再算十位。", "个位没有跨过10，答案就不会进位或退位。"],
    visual: "NUMBER_PATH",
  },
  C10: {
    focus: "在100以内熟练进行不进位、不退位加减。",
    commonMistake: "漏写十位，或把两位数的位值看错。",
    hints: ["先看个位，再看十位。", "每一位都单独计算，不要把个位和十位混算。"],
    visual: "NUMBER_PATH",
  },
  C11: {
    focus: "通过凑十和借位理解10以内的进位、退位。",
    commonMistake: "进位后忘记十位的1，或退位后个位少算1个十。",
    hints: ["加法先想能不能凑成10。", "减法不够减时，先借1个十再算个位。"],
    visual: "NUMBER_PATH",
  },
  C12: {
    focus: "在20以内熟练运用凑十进位和退位减法。",
    commonMistake: "看到两位数就直接逐个数，漏掉进位或退位。",
    hints: ["把一个数拆成能凑10的部分。", "退位时先拆出1个十，再减个位。"],
    visual: "NUMBER_PATH",
  },
  C13: {
    focus: "在50以内理解两位数加减中的进位和退位。",
    commonMistake: "个位跨过10后，十位没有加1或减1。",
    hints: ["先处理个位的进位或退位。", "再把十位的变化写清楚。"],
    visual: "NUMBER_PATH",
  },
  C14: {
    focus: "在100以内规范完成两位数进位加法。",
    commonMistake: "个位相加满10后，忘记给十位进1。",
    hints: ["个位对个位、十位对十位。", "先算个位，满10就向十位进1。"],
    visual: "NUMBER_PATH",
  },
  C15: {
    focus: "在100以内规范完成两位数退位减法。",
    commonMistake: "个位不够减时，忘记从十位借1个十。",
    hints: ["个位不够减时，先从十位借1个十。", "借来的1个十要和个位合起来再减。"],
    visual: "NUMBER_PATH",
  },
  V01: {
    focus: "从两组图形抽象出部分加部分等于整体。",
    commonMistake: "只数一组，或数字与图片分组不对应。",
    hints: ["先分别数出左边和右边有几个。", "两部分都留下，合起来用加法。"],
    visual: "PART_WHOLE",
  },
  V02: {
    focus: "由整体和已知部分求未知部分。",
    commonMistake: "把总数和已知部分相加。",
    hints: ["括号告诉你总数，问号是一部分。", "用总数拿走看得见的部分。"],
    visual: "PART_WHOLE",
  },
  V03: {
    focus: "把多个可见分组依次转换为连加算式。",
    commonMistake: "漏写一组，或把组内物品误写成多个加数。",
    hints: ["图片有几组，算式就写几个加数。", "从左到右，把每组数量依次相加。"],
    visual: "COUNT",
  },
  V04: {
    focus: "理解划去表示从整体中移除一部分。",
    commonMistake: "只数未划去的数量，却把它写成减数。",
    hints: ["先数原来一共有几个，再数被划去几个。", "原数减去划去的数，得到剩下的数。"],
    visual: "STORY_CHANGE",
  },
  V05: {
    focus: "把两批移除动作表示成连减。",
    commonMistake: "把两次划去合成加法，或漏写一个减号。",
    hints: ["两种划线表示分两次拿走。", "先减第一批，再用剩下的数减第二批。"],
    visual: "STORY_CHANGE",
  },
  V06: {
    focus: "根据括号和问号识别整体或未知部分。",
    commonMistake: "只看数字，不看问号处在整体还是部分。",
    hints: ["先看大括号问的是整体还是一部分。", "问整体就合起来；问部分就用整体拿走已知部分。"],
    visual: "PART_WHOLE",
  },
  V07: {
    focus: "理解两个部分和整体之间的四个互逆算式。",
    commonMistake: "减法从部分开始，或左右相等时重复写相同算式。",
    hints: ["先找两个部分和它们的总数。", "加法交换两个部分；减法都从总数开始。"],
    visual: "PART_WHOLE",
  },
  W01: {
    focus: "识别静态合并情境中的两个部分和整体。",
    commonMistake: "看到两个数就相减，没有理解“一共”。",
    hints: ["把两处的数量分别圈出来。", "题目问一共，把两部分合起来。"],
    visual: "PART_WHOLE",
  },
  W02: {
    focus: "识别增加变化并求变化后的结果。",
    commonMistake: "忽略“又放进、又来了”等变化词。",
    hints: ["先找原来有多少，再找又来了多少。", "数量变多了，用合起来的方法。"],
    visual: "STORY_CHANGE",
  },
  W03: {
    focus: "识别减少变化并求剩余量。",
    commonMistake: "把拿走的数量与剩余数量混淆。",
    hints: ["先找原来有多少，再找拿走多少。", "数量变少了，用原来减拿走。"],
    visual: "STORY_CHANGE",
  },
  W04: {
    focus: "由起始量和结果量反推变化量。",
    commonMistake: "套用正向加法，没有识别问题问的是变化了多少。",
    hints: ["画出“原来 → 现在”的变化。", "增加量是现在减原来；拿走量是原来减现在。"],
    visual: "STORY_CHANGE",
  },
  W05: {
    focus: "由总量与已知部分求另一部分。",
    commonMistake: "把总量与其中一部分相加。",
    hints: ["把总数想成一个大圈，再找出已知部分。", "另一部分就是总数拿走已知部分。"],
    visual: "PART_WHOLE",
  },
  W06: {
    focus: "用一一对应理解多几、少几的差。",
    commonMistake: "受“多、少”措辞影响而选错运算方向。",
    hints: ["把两组一个对一个配起来。", "求多几个或少几个，都用大数减小数。"],
    visual: "COMPARE",
  },
  W07: {
    focus: "理解同样多，再完成两组的合并。",
    commonMistake: "把“同样多”当成0，忽略第二组也有相同数量。",
    hints: ["同样多表示第二组和第一组数量相同。", "先补出第二组的数量，再把两组合起来。"],
    visual: "PART_WHOLE",
  },
  W08: {
    focus: "根据比较关系和相差数反求较多量或较少量。",
    commonMistake: "看见“多”就一律加、看见“少”就一律减，没有先判断问题求谁。",
    hints: ["先圈出问题问的是较多的还是较少的数量。", "求较多量就加相差数；求较少量就减相差数。"],
    visual: "COMPARE",
  },
  W09: {
    focus: "从结果和变化量逆向求起始量。",
    commonMistake: "继续按故事发生方向计算，没有从结果倒推。",
    hints: ["题目问的是“原来”，要从现在往回想。", "后来增加就从现在减；后来拿走就把剩下和拿走的合起来。"],
    visual: "STORY_CHANGE",
  },
  S01: {
    focus: "使用稳定参照方向判断一维相对位置。",
    commonMistake: "观察过程中改变方向或参照物。",
    hints: ["先确定从哪一边看。", "用手沿同一个方向指，不要中途换方向。"],
    visual: "DIRECTION",
  },
  S02: {
    focus: "以参照物为中心判断二维位置关系。",
    commonMistake: "说成参照物相对目标的位置，方向正好相反。",
    hints: ["先找到参照物，站在它的位置看。", "再看目标在它的上、下、左、右或斜方向。"],
    visual: "DIRECTION",
  },
  S03: {
    focus: "把多条肯定、否定和关系条件转化为系统排除。",
    commonMistake: "逐条猜答案，没有利用已确定结果排除同行同列。",
    hints: ["先做“确定是”的条件，在格子里打勾。", "每打一个勾，就排除同一行和同一列的其他格。"],
    visual: "ELIMINATION",
  },
  S04: {
    focus: "按层分解立体结构，并保持遮挡部分的空间表象。",
    commonMistake: "只数看得见的面，漏掉被上层遮住的底层方块。",
    hints: ["从最底层开始，一层一层数。", "点“放下一层”，记下每层数量，最后合起来。"],
    visual: "LAYERS",
  },
  S05: {
    focus: "固定参照物，判断另一对象在它的左边或右边。",
    commonMistake: "把目标和参照物交换，得到相反方向。",
    hints: ["先找到题目中“谁的”后面那个参照物。", "站在参照物的位置看，目标在左边还是右边。"],
    visual: "DIRECTION",
  },
};

export function getMathTeachingGuide(typeId: MathQuestionTypeId) {
  return MATH_TEACHING_GUIDES_BY_TYPE[typeId];
}
