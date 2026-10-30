import type { KnowledgeNode, Scenario, Workspace } from './types'
import { validateWorkspace } from './model'

type ExampleNode = [string, KnowledgeNode['kind'], string, string, string]
const examples: Record<Scenario, { title: string; summary: string; nodes: ExampleNode[]; edges: [number, number, string][]; questions: [number, string, string][] }> = {
  architecture: {
    title: '一次登录请求，如何抵达系统深处',
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
}

export function exampleWorkspace(scenario: Scenario): Workspace {
  const sample = examples[scenario]
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
  }))
  const workspaceId = crypto.randomUUID()
  const positions = Object.fromEntries(nodes.map((node, index) => [
    node.id,
    { x: 60 + (index % 3) * 280, y: 70 + Math.floor(index / 3) * 230 },
  ]))
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
    : []
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
    : []
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
  return validateWorkspace({
    schemaVersion: 2,
    revision: 0,
    id: workspaceId,
    title: sample.title,
    scenario,
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
    relations: sample.edges.map(([a, b, label], i) => ({
      id: `edge-${i + 1}`,
      from: nodes[a]!.id,
      to: nodes[b]!.id,
      kind: scenario === 'course' ? 'prerequisite' : scenario === 'product' ? 'next' : 'calls',
      label,
    })),
    views: [{
      id: `view-${workspaceId}`,
      title: sample.title,
      scenario,
      kind: scenario === 'course' ? 'learning' : scenario === 'product' ? 'flow' : 'map',
      nodeIds: nodes.map(node => node.id),
      path: nodes.map(node => node.id),
      positions,
    }],
    flows: demoFlow,
    decisions: demoDecisions,
    productItems: demoProductItems,
    questions: sample.questions.map(([i, prompt, answer], j) => ({
      id: `question-${j + 1}`,
      nodeId: nodes[i]!.id,
      prompt,
      answer,
      relatedNodeIds: [],
    })),
    attempts: [],
    createdAt: now,
    updatedAt: now,
  })
}
