import type { KnowledgeNode, RelationKind, Template, ViewForm, Workspace } from './types'
import { validateWorkspace } from './model'

type ExampleNode = [string, KnowledgeNode['kind'], string, string, string]
/** [要点, 讲述, 本步出现的对象下标, 聚焦的对象下标, 画面：视图下标或内容块 id] */
type ExampleStep = [string, string, number[], number[]?, (number | string)?]
interface Example {
  title: string; summary: string; question: string; takeaway: string; audience: string
  relation: RelationKind
  views: [string, ViewForm, number[]?][]
  nodes: ExampleNode[]
  edges: [number, number, string, RelationKind?][]
  questions: [number, string, string][]
  steps: ExampleStep[]
}
const examples: Record<Template, Example> = {
  architecture: {
    title: '一次登录请求，如何抵达系统深处',
    question: '一次登录请求是怎么被验证并建立会话的？',
    takeaway: '浏览器只负责提交；认证接口在服务端校验凭据、建立会话，再用 Cookie 传回会话标识。登录成功不等于获得授权。',
    audience: '刚接触 Web 后端的开发者',
    relation: 'calls',
    views: [['登录链路', 'graph'], ['组件对比', 'matrix']],
    steps: [
      ['请求从浏览器出发，到达认证接口', '用户在浏览器提交邮箱和密码，请求经 HTTPS 到达认证接口。浏览器不是可信边界，接口要重新校验输入。', [0, 1]],
      ['接口先查账号，再校验凭据', '认证接口按账号标识取出加盐的密码哈希，交给凭据校验去比对。存储里没有明文密码。', [2, 3], [1, 2, 3]],
      ['校验通过后建立服务端会话', '凭据匹配时，在会话存储里记录身份和过期时间。校验失败则返回统一的失败信息，不建立会话。', [4], [3, 4]],
      ['会话标识通过 Cookie 回到浏览器', '服务端只把会话标识放进 Cookie。之后每个请求都要重新验证身份与权限。', [5], [4, 5]],
      ['按发生顺序再看一遍', '时序图把前面几步按顺序排开，失败分支用虚线表示。这是教学模型，不是运行证据。', [], [], 'demo-login-flow'],
      ['为什么选服务端会话', '这是一个取舍：服务端会话便于注销和失效，但要管理存储可用性。实际策略仍需安全评审。', [], [], 'demo-login-decision'],
    ],
    summary: '示例项目 · 从浏览器到会话存储，探索一条登录链路。这里是教学模型，不是对真实仓库的分析。',
    nodes: [
      ['浏览器', 'component', '收集登录信息，通过 HTTPS 向认证接口发起请求。页面不应记录明文密码。', '用户提交邮箱和密码，界面进入等待状态。', '不要把前端校验当作服务端安全边界。'],
      ['认证接口', 'interface', '接收请求，验证输入，执行限流，并协调账号查询和凭据校验。', 'POST /login 返回成功、凭据错误或限流结果。', '避免通过不同错误文案暴露账号是否存在。'],
      ['账号存储', 'component', '保存账号标识与密码哈希，不保存可直接读取的明文密码。', '按账号标识查询已存储的加盐密码哈希。', '密码哈希不是可逆加密，不应设计“找回原密码”。'],
      ['凭据校验', 'component', '使用合适的密码哈希库验证提交的密码，成功后建立会话。', '验证失败时返回统一的认证失败信息。', '不要自己实现密码学算法或直接比较明文。'],
      ['会话存储', 'component', '记录会话身份和过期时间，为后续请求提供认证依据。', '注销时使当前会话失效。', '登录成功并不意味着所有资源访问都已获得授权。'],
      ['安全 Cookie', 'concept', '通过配置适当的 HttpOnly、Secure 和 SameSite 属性传递会话标识。具体策略取决于部署与跨站需求。', '浏览器后续请求携带会话 Cookie，服务端重新验证身份与权限。', 'Cookie 属性不能替代完整的 CSRF 防护与权限校验。'],
    ],
    edges: [[0, 1, '提交登录'], [1, 2, '查询账号'], [1, 3, '验证凭据'], [3, 4, '建立会话'], [4, 5, '返回会话标识']],
    questions: [[1, '前端已经检查了输入，认证接口为什么仍要校验？', '浏览器并不是可信边界，请求可以绕过页面直接构造。服务端必须验证输入，并独立进行认证与授权。'], [4, '登录成功和访问某个资源被允许，是同一个判断吗？', '不是。认证确认身份，授权决定该身份是否可以执行具体操作。']],
  },
  product: {
    title: '把「预约咨询」变成可交付的方案',
    question: '预约咨询这个功能，从用户目标到验收该怎么交付？',
    takeaway: '主流程是选时段、确认、成功；提交时的时段冲突必须有恢复路径；取消规则仍待确认，不能当成既定需求。',
    audience: '参与评审的产品与开发',
    relation: 'next',
    views: [['预约流程', 'flow'], ['状态对比', 'matrix', [1, 2, 3, 4]]],
    steps: [
      ['先看用户要完成什么', '一切从用户目标出发：快速找到合适的时段，并且明确知道预约有没有成功。这是演示假设，还没有用户研究支持。', [0]],
      ['主流程：选时段、确认、成功', '用户选一个时段，在确认页核对时间、费用和取消规则，提交后看到带预约编号的结果。', [1, 2, 3], [1, 2, 3]],
      ['提交时时段可能已被占用', '展示时可用不代表提交时仍可用。冲突时要说明原因、保留已填内容，并回到选时段。', [4], [2, 4, 1]],
      ['取消规则还没定', '是否允许自助取消、截止时间和退款规则都待相关方确认，先标为待定。', [5], [5]],
      ['把假设写成可验收的条件', '假设要落到能检查的验收条件上，并写明备选方案的收益和代价。', [], [], 'demo-product-1'],
      ['取消规则的取舍', '在确认之前保留待定状态，不把假设写成承诺。', [], [], 'demo-decision-1'],
    ],
    summary: '示例方案 · 一起梳理目标、主流程与异常分支。所有需求均为演示假设，仍需通过用户研究确认。',
    nodes: [
      ['用户目标', 'requirement', '假设：用户希望快速找到合适的咨询时段，并明确知道预约是否成功。', '忙碌的用户希望在一次操作中完成时间选择与确认。', '用户目标不是“增加一个预约按钮”。'],
      ['选择时段', 'state', '展示可预约时段和时区，允许用户选择后继续。', '用户选择周五下午，并在确认页再次看到完整日期。', '不能只写“下午三点”而不说明日期与时区。'],
      ['确认预约', 'state', '在提交前展示时间、费用和取消规则。用户明确确认后再提交。', '确认按钮在请求期间避免重复提交。', '禁用按钮不能替代服务端幂等处理。'],
      ['预约成功', 'state', '清晰展示预约结果、预约编号和下一步操作。', '用户可以查看详情或复制预约编号。', '不要只弹一个转瞬即逝的成功提示。'],
      ['时段被占用', 'state', '提交时若时段已不可用，解释原因，并保留其他已输入内容。', '引导用户重新选择时间，而不是清空整个表单。', '展示时可用不代表提交时一定可用。'],
      ['取消与取舍', 'requirement', '待决定：是否允许自助取消，以及截止时间、退款规则与通知方式。记录决策依据后再进入实现。', '把取消边界写进验收条件，并与相关方确认。', 'AI 提出的规则不是已确认的业务规则。'],
    ],
    edges: [[0, 1, '满足目标'], [1, 2, '继续'], [2, 3, '成功'], [2, 4, '冲突'], [4, 1, '重新选择'], [3, 5, '后续操作']],
    questions: [[4, '时段在提交时被别人抢先预约，界面应该如何处理？', '明确说明冲突，保留已填内容，刷新可选时段，允许重新选择；不能仍显示成功。'], [5, '取消规则还没确认时，应该直接让 AI 补齐并交付开发吗？', '不应该。应标记待定问题、说明选项与影响，待相关方确认后再形成需求和验收条件。']],
  },
  course: {
    title: '计算机网络 · 理解可靠传输',
    question: 'TCP 怎样在不可靠的网络上做到可靠传输？',
    takeaway: '序号标出字节位置，确认反馈接收进度，超时触发重传；流量控制看接收方，拥塞控制看网络。',
    audience: '准备计算机网络考试的学生',
    relation: 'prerequisite',
    views: [['知识关系', 'graph'], ['知识结构', 'tree'], ['学习脉络', 'timeline']],
    steps: [
      ['起点：网络会丢、会重、会乱序', '可靠传输要解决的就是这三件事。先记住问题，再看每个机制对付哪一件。', [0]],
      ['序号给每个字节一个位置', '有了位置，接收方就能把乱序的数据放回原处，也能认出重复的数据。', [1], [0, 1]],
      ['确认告诉发送方收到了哪里', '确认号是接收方期望的下一个字节序号，发送方据此知道进度。', [2], [1, 2]],
      ['没等到确认就重传', '超时没有确认时重传。确认丢失也会触发重传，所以重传不等于原数据丢了。', [3], [2, 3]],
      ['两种“慢下来”的原因不同', '流量控制是因为接收方处理不过来，拥塞控制是因为网络堵了。两者同时约束发送量。', [4, 5], [4, 5]],
    ],
    summary: '示例课程 · 从序号、确认到重传，建立知识之间的联系，再用主动回忆检查理解。并非任何官方考试大纲。',
    nodes: [
      ['不可靠网络', 'concept', '网络传输可能出现丢失、重复和乱序。可靠传输机制需要处理这些情况。', '发送了三段数据，接收方可能先收到第三段。', '传输可靠不代表网络本身不会丢包。'],
      ['序号', 'concept', 'TCP 使用字节序号标识数据在字节流中的位置，帮助接收端按序重组并识别重复。', '序号让接收方知道某段数据应放在字节流的哪个位置。', '不要把 TCP 序号简单理解为“第几个数据包”。'],
      ['确认机制', 'concept', '确认号表达接收方期望收到的下一个字节序号。确认机制为发送方提供接收进度信息。', '累计确认表示此前连续的数据已被接收。', '收到确认不等于应用层业务已经处理成功。'],
      ['超时重传', 'concept', '发送方在适当时间内未获得确认时可重传数据。定时器需要适应往返时间。', '确认丢失也可能导致重传，接收方需要处理重复数据。', '重传不一定意味着原始数据已经丢失。'],
      ['流量控制', 'concept', '流量控制用于避免发送速度超出接收端处理与缓存能力。', '接收窗口变小时，发送方需要限制未确认数据量。', '流量控制与拥塞控制针对的约束不同。'],
      ['拥塞控制', 'concept', '拥塞控制根据网络反馈调整发送行为，避免持续加剧网络拥塞。', '发送端根据拥塞控制算法和接收窗口共同约束发送量。', '更大的接收窗口不意味着可以忽略网络拥塞。'],
    ],
    edges: [[0, 1, '需要标识'], [1, 2, '理解基础'], [2, 3, '理解基础'], [2, 4, '接收约束'], [3, 5, '网络反馈']],
    questions: [[1, 'TCP 序号标识的是数据包编号还是字节位置？为什么重要？', '标识字节流位置。这使接收方能够重组乱序数据、识别重复，而不依赖每次分段是否相同。'], [3, '发生超时重传，能确定原始数据丢失了吗？', '不能。数据可能已经到达但确认丢失或延迟，因此需要序号和重复数据处理。'], [4, '流量控制与拥塞控制分别保护什么？', '流量控制关注接收方能力，拥塞控制关注网络承载能力；两者共同约束发送行为。']],
  },
  concept: {
    title: '递归是什么',
    summary: '示例概念 · 用阶乘讲清递归的两个组成部分、它的运行代价，以及和循环的区别。内容为教学示例。',
    question: '递归到底是什么，什么时候会出问题？',
    takeaway: '递归把问题拆成更小的同类问题；必须有终止条件，并且每一步都要让问题变小。',
    audience: '刚学编程的人',
    relation: 'partOf',
    views: [['思维图', 'tree'], ['递归与循环', 'matrix', [0, 4]]],
    nodes: [
      ['递归', 'concept', '函数在自己的定义里调用自己，每次把问题缩小一点，直到小到可以直接回答。', '阶乘：n! = n × (n-1)!，而 0! = 1。', '缺了终止条件，调用就停不下来。'],
      ['终止条件', 'concept', '问题小到不需要再拆时，直接给出答案的那个分支。', '阶乘里 n 等于 0 时直接返回 1。', '终止条件写错或漏写，调用会一直进行到栈溢出。'],
      ['递推步骤', 'step', '把当前问题表示成一个更小的同类问题，再加上一点额外工作。', '阶乘里把 n! 表示成 n 乘以 (n-1)!。', '每一步必须让问题变小，否则到不了终止条件。'],
      ['调用栈', 'concept', '每次调用都会保存自己的参数和返回位置；递归越深，占用的栈越多。', '计算 3! 时依次进入 3、2、1、0 四层调用，再逐层返回。', '深度很大时可能栈溢出，这与算法是否正确无关。'],
      ['循环', 'concept', '用同一段代码重复执行并更新变量来完成重复工作，不新增调用层。', '用一个累乘变量从 1 乘到 n 也能算阶乘。', '循环和递归能互相改写，不代表两种写法一样好读或一样省资源。'],
    ],
    edges: [[1, 0, '组成'], [2, 0, '组成'], [0, 3, '运行时依赖', 'depends'], [0, 4, '对比', 'compares']],
    questions: [[1, '递归函数漏写终止条件会怎样？', '调用会一直进行下去，直到调用栈耗尽而报错。'], [3, '为什么很深的递归可能失败，即使逻辑是对的？', '每层调用都占用栈空间，深度超过栈的容量就会溢出；这和逻辑是否正确无关。']],
    steps: [
      ['递归就是用更小的自己来回答自己', '先看定义：函数调用自己，但每次面对的问题都小一点。', [0]],
      ['两个部分缺一不可', '终止条件负责停下来，递推步骤负责变小。少了任何一个，递归都不成立。', [1, 2], [1, 2]],
      ['每一层调用都占着栈', '递归不是免费的：每进一层就多占一份栈空间，返回时才释放。', [3], [3]],
      ['和循环比一比', '同一件事常常两种写法都行。对比表把两者的做法、例子和容易踩的坑放在一起看。', [4], [0, 4], 1],
    ],
  },
  book: {
    title: '一篇文章的论证：为什么要先写测试',
    summary: '示例文章 · 拆出主张、理由、反面意见和结论。文章内容是为演示编写的，不代表经过度量验证的结论。',
    question: '这篇文章凭什么说应该先写测试？',
    takeaway: '主张是先写测试让修改更安全，依据是可执行的预期和尽早发现回归；代价是时间，所以作者建议先覆盖最关键的部分。',
    audience: '想快速掌握文章论证的读者',
    relation: 'supports',
    views: [['论证结构', 'tree'], ['行文脉络', 'timeline']],
    nodes: [
      ['先写测试能让修改更安全', 'claim', '文章的核心主张：在改动代码之前先有测试，改动之后能立刻知道有没有弄坏已有行为。', '重构一个函数前，先补上覆盖它现有行为的测试。', '这是示例文章的主张，不是经过度量验证的结论。'],
      ['测试是可执行的预期', 'claim', '测试用例记录了输入是什么、应该得到什么，比口头约定更不容易走样。', '一条用例写明空购物车结算时应返回 0。', '测试只说明被写到的情况，没写到的行为它不保证。'],
      ['回归能被尽早发现', 'claim', '每次改动后运行测试，新引入的错误会在提交前暴露，而不是等用户报告。', '改了折扣计算后，原有的满减用例立刻失败。', '测试通过不代表没有错误，只代表已写的用例没有被破坏。'],
      ['写测试要花时间', 'claim', '文章承认的反面意见：写和维护测试有成本，需求频繁变化时成本更高。', '界面文案每天在改时，逐字断言的用例要跟着改。', '成本是真实的，不能因为支持主张就略过。'],
      ['先覆盖最关键的部分', 'step', '作者的建议：先给最常改、出错代价最高的部分写测试，而不是追求全部覆盖。', '先覆盖结算和权限，再考虑展示细节。', '这是作者的取舍建议，适用范围需要自己判断。'],
    ],
    edges: [[1, 0, '支持'], [2, 0, '支持'], [3, 0, '反驳', 'contradicts'], [0, 4, '所以', 'causes']],
    questions: [[3, '文章有没有回避“写测试要花时间”这个反对意见？', '没有。文章承认成本是真实的，并据此建议先覆盖最常改、出错代价最高的部分。']],
    steps: [
      ['文章只有一个核心主张', '先找到主张：先写测试，修改才安全。后面的内容都围绕它展开。', [0]],
      ['两条支持的理由', '一是测试把预期写成了能运行的说明，二是改坏了能马上知道。', [1, 2], [1, 2]],
      ['作者承认的反面意见', '写测试要花时间。文章没有回避这一点。', [3], [3]],
      ['结论落在一个取舍上', '既然有成本，就先覆盖最关键的部分。', [4], [0, 4]],
    ],
  },
}

export function exampleWorkspace(template: Template): Workspace {
  const scenario = template
  const sample = examples[template]
  const now = Date.now()
  const sourceId = 'demo-source'
  const sourceText = sample.nodes.map(node => `${node[0]}\n${node[2]}`).join('\n\n')
  const cite = (quote: string) => {
    const start = sourceText.indexOf(quote)
    if (start < 0) throw new TypeError('Demo citation quote was not found in its source.')
    return { sourceId, quote, version: 1, start, end: start + quote.length }
  }
  const nodes: KnowledgeNode[] = sample.nodes.map(([title, kind, body, example, pitfall], i) => ({
    id: `node-${i + 1}`,
    title,
    kind,
    body,
    example,
    pitfall,
    notes: '',
    acceptance: scenario === 'product'
      ? [
          '待确认：用户能清楚说明预约结果。',
          '用户能看到日期、时区与可用状态。',
          '提交中防止重复操作，失败后允许重试。',
          '成功结果包含可再次查阅的预约编号。',
          '发生冲突时保留其他输入并允许重新选时段。',
          '待确认：取消截止时间和退款规则。',
        ][i]
      : '',
    citations: [cite(body)],
    provenance: 'demo',
    certainty: 'supported',
  }))
  const workspaceId = crypto.randomUUID()
  const demoFlow = scenario === 'product'
    ? [{
        id: 'demo-flow-1',
        title: '预约主流程与失败分支（演示，未经验证）',
        steps: [
          {
            id: 'demo-step-1',
            from: nodes[0]!.id,
            to: nodes[1]!.id,
            message: '用户选择咨询时段',
            condition: '演示主流程',
            branch: 'main',
            evidence: 'unverified',
            citations: [cite(sample.nodes[0]![2])],
          },
          {
            id: 'demo-step-2',
            from: nodes[1]!.id,
            to: nodes[2]!.id,
            message: '核对信息并提交预约',
            condition: '演示主流程',
            branch: 'main',
            evidence: 'unverified',
            citations: [cite(sample.nodes[2]![2])],
          },
          {
            id: 'demo-step-3',
            from: nodes[2]!.id,
            to: nodes[3]!.id,
            message: '展示预约结果',
            condition: '时段仍可用的演示路径',
            branch: 'main',
            evidence: 'unverified',
            citations: [cite(sample.nodes[3]![2])],
          },
          {
            id: 'demo-step-4',
            from: nodes[2]!.id,
            to: nodes[4]!.id,
            message: '提示时段冲突',
            condition: '提交时段已被占用的演示失败分支',
            branch: 'failure',
            evidence: 'unverified',
            citations: [cite(sample.nodes[4]![2])],
          },
          {
            id: 'demo-step-5',
            from: nodes[4]!.id,
            to: nodes[1]!.id,
            message: '保留输入并重新选择',
            condition: '演示恢复路径',
            branch: 'failure',
            evidence: 'unverified',
            citations: [cite(sample.nodes[4]![2])],
          },
        ],
      }]
    : scenario === 'architecture' ? [{
        id: 'demo-login-flow', title: '登录正常与失败链路（教学模型，非运行证据）',
        steps: [
          [0, 1, '提交登录信息', '用户主动提交', 'main', 0],
          [1, 2, '查询账号与哈希', '输入合法且未触发限流', 'main', 2],
          [1, 3, '校验提交的凭据', '已取得账号凭据', 'main', 3],
          [1, 0, '返回统一认证失败', '凭据不匹配，不建立会话', 'failure', 3],
          [3, 4, '建立服务端会话', '凭据匹配', 'main', 4],
          [1, 5, '设置会话 Cookie', '会话建立成功', 'main', 5],
          [5, 0, '后续请求携带会话标识', '符合 Cookie 属性约束', 'main', 5],
        ].map(([from, to, message, condition, branch, evidence], index) => ({
          id: `demo-login-step-${index + 1}`, from: nodes[from as number]!.id, to: nodes[to as number]!.id,
          message, condition, branch, evidence: 'unverified', citations: [cite(sample.nodes[evidence as number]![2])],
        })),
      }] : []
  const demoDecisions = scenario === 'product'
    ? [{
        id: 'demo-decision-1',
        title: '取消规则待确认（演示记录）',
        context: '示例材料指出取消边界尚待相关方确认；这不是已验证的产品规则。',
        choice: '演示记录：在确认前保留待定状态，不把假设写成承诺。',
        alternatives: '允许自助取消并确定截止时间；或由支持人员处理。',
        consequences: '演示取舍需要产品、运营与退款政策共同确认。',
        nodeIds: [nodes[5]!.id],
        citations: [cite(sample.nodes[5]![2])],
      }]
    : scenario === 'architecture' ? [{
        id: 'demo-login-decision', title: '服务端会话的取舍（演示，待确认）',
        context: '教学模型需要展示登录与后续认证的区别；不是对真实系统的评审结论。',
        choice: '演示采用服务端保存会话，Cookie 只传递会话标识；实际策略仍需安全评审。',
        alternatives: '签名令牌与轮换机制；需另行设计失效、撤销与客户端存储边界。',
        consequences: '需要管理会话过期、注销和存储可用性；会话身份不能替代资源授权。',
        nodeIds: [nodes[4]!.id, nodes[5]!.id], citations: [cite(sample.nodes[4]![2]), cite(sample.nodes[5]![2])],
      }] : []
  const demoProductItems = scenario === 'product'
    ? [
        {
          id: 'demo-product-1',
          title: '清楚展示预约结果（演示假设）',
          type: 'hypothesis',
          status: 'unverified',
          body: '演示假设：用户需要可再次查阅的预约结果；尚非研究结论。',
          nodeIds: [nodes[0]!.id, nodes[3]!.id],
          relatedIds: ['demo-product-2'],
          citations: [cite(sample.nodes[0]![2]), cite(sample.nodes[3]![2])],
          criteria: [{
            id: 'demo-criterion-1',
            text: '演示验收条件：结果包含日期、时区与预约编号。',
            state: 'pending',
            evidence: '',
          }],
          alternatives: [{
            id: 'demo-alternative-1',
            title: '在结果页展示并提供可再次访问的详情',
            benefits: '演示预期：用户可回查关键信息。',
            costs: '需要确认身份校验、链接有效期和隐私边界。',
          }],
        },
        {
          id: 'demo-product-2',
          title: '时段冲突后的恢复（演示假设）',
          type: 'hypothesis',
          status: 'unverified',
          body: '演示假设：冲突提示应保留其他已输入内容；需要通过研究与实现验证。',
          nodeIds: [nodes[4]!.id],
          relatedIds: ['demo-product-1'],
          citations: [cite(sample.nodes[4]![2])],
          criteria: [{
            id: 'demo-criterion-2',
            text: '演示验收条件：冲突后可重新选择时段。',
            state: 'pending',
            evidence: '',
          }],
          alternatives: [{
            id: 'demo-alternative-2',
            title: '刷新时段并继续编辑',
            benefits: '演示预期：避免清空用户已填写内容。',
            costs: '需要验证并发时段变化与表单状态恢复。',
          }],
        },
      ]
    : []
  const views = sample.views.map(([title, form, members], index) => ({
    id: `view-${index + 1}-${workspaceId}`,
    title,
    form,
    nodeIds: (members ?? nodes.map((_, at) => at)).map(at => nodes[at]!.id),
    positions: {},
  }))
  const story = sample.steps.map(([title, narration, reveal, focus, stage], index) => ({
    id: `demo-story-${index + 1}`,
    title,
    narration,
    stageId: typeof stage === 'string' ? stage : views[stage ?? 0]!.id,
    reveal: reveal.map(at => nodes[at]!.id),
    focus: (focus ?? reveal).map(at => nodes[at]!.id),
    citations: reveal.slice(0, 1).map(at => cite(sample.nodes[at]![2])),
    provenance: 'demo',
  }))
  return validateWorkspace({
    schemaVersion: 3,
    revision: 0,
    id: workspaceId,
    title: sample.title,
    template,
    question: sample.question,
    takeaway: sample.takeaway,
    audience: sample.audience,
    summary: sample.summary,
    sources: [{
      id: sourceId,
      title: '内置教学材料（示例，非外部证据）',
      text: sourceText,
      version: 1,
      createdAt: now,
      versions: [],
    }],
    nodes,
    relations: sample.edges.map(([a, b, label, kind], i) => ({
      id: `edge-${i + 1}`,
      from: nodes[a]!.id,
      to: nodes[b]!.id,
      kind: kind ?? sample.relation,
      label,
    })),
    views,
    story,
    flows: demoFlow,
    decisions: demoDecisions,
    productItems: demoProductItems,
    questions: sample.questions.map(([i, prompt, answer], j) => ({
      id: `question-${j + 1}`,
      nodeId: nodes[i]!.id,
      prompt,
      answer,
      relatedNodeIds: [],
      stepId: story.find(step => step.reveal.includes(nodes[i]!.id))?.id ?? '',
    })),
    attempts: [],
    createdAt: now,
    updatedAt: now,
  })
}
