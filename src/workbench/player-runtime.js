/* Offline player for an exported OneLook explanation. Plain DOM, no network access. */
(function () {
  var data = JSON.parse(document.getElementById('onelook-data').textContent)
  var NS = 'http://www.w3.org/2000/svg'
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var index = 0
  var stages = {}

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag)
    for (var key in attrs) node.setAttribute(key, attrs[key])
    return node
  }

  function buildDiagram(stage) {
    var root = svg('svg', { class: 'diagram', role: 'img', 'aria-label': stage.title })
    var defs = svg('defs', {})
    var marker = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' })
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }))
    defs.appendChild(marker)
    root.appendChild(defs)
    var camera = svg('g', { class: 'camera' })
    root.appendChild(camera)
    var parts = { svg: root, camera: camera, nodes: {}, edges: [], tokens: svg('g', {}), stage: stage }
    if (stage.axis) {
      camera.appendChild(svg('line', { class: 'axis', x1: stage.axis.x1, y1: stage.axis.y, x2: stage.axis.x2, y2: stage.axis.y }))
      stage.axis.ticks.forEach(function (tick) {
        var line = svg('line', { class: 'axis tick', x1: tick.x, y1: tick.y1, x2: tick.x, y2: tick.y2 })
        camera.appendChild(line)
        parts.edges.push({ node: line, from: tick.id, to: tick.id })
      })
    }
    stage.edges.forEach(function (edge) {
      var group = svg('g', { class: 'edge semantic-' + (edge.tone || 'slate') + (edge.cross ? ' cross' : '') })
      group.appendChild(svg('path', { d: edge.d, pathLength: 1, 'marker-end': 'url(#arrow)' }))
      if (edge.label) {
        var labelWidth = Math.max(26, Math.min(180, Array.from(edge.label).reduce(function (width, c) { return width + (c.charCodeAt(0) > 255 ? 10 : 6) }, 12)))
        group.appendChild(svg('rect', { class: 'edge-label-bg', x: edge.lx - labelWidth / 2, y: edge.ly - 11, width: labelWidth, height: 16, rx: 4 }))
        var label = svg('text', { x: edge.lx, y: edge.ly, 'text-anchor': 'middle' })
        label.textContent = edge.label
        group.appendChild(label)
      }
      camera.appendChild(group)
      parts.edges.push({ node: group, from: edge.from, to: edge.to, d: edge.d })
    })
    if (stage.root) {
      var centre = svg('g', { class: 'root' })
      centre.appendChild(svg('rect', { x: stage.root.box.x, y: stage.root.box.y, width: stage.root.box.w, height: stage.root.box.h, rx: 8 }))
      var title = svg('text', { x: stage.root.box.x + stage.root.box.w / 2, y: stage.root.box.y + stage.root.box.h / 2 + 5, 'text-anchor': 'middle' })
      title.textContent = stage.root.title.slice(0, 12)
      centre.appendChild(title)
      camera.appendChild(centre)
    }
    stage.nodes.forEach(function (item) {
      var group = svg('g', { class: 'node', transform: 'translate(' + item.x + ',' + item.y + ')' })
      var frame = svg('foreignObject', { width: item.w, height: item.h })
      var card = el('div', 'card')
      card.classList.add('semantic-' + item.tone)
      card.appendChild(el('span', 'kind', item.sigil + ' ' + item.kind))
      card.appendChild(el('strong', '', item.title))
      card.appendChild(el('span', 'caption', item.body))
      frame.appendChild(card)
      group.appendChild(frame)
      camera.appendChild(group)
      parts.nodes[item.id] = { node: group, box: item }
    })
    camera.appendChild(parts.tokens)
    return parts
  }

  function buildMatrix(stage) {
    var table = el('table', 'matrix')
    var head = el('tr')
    head.appendChild(el('th', '', '对象'))
    stage.columns.forEach(function (column) { head.appendChild(el('th', '', column)) })
    table.appendChild(head)
    var rows = {}
    stage.rows.forEach(function (row) {
      var line = el('tr')
      line.appendChild(el('th', '', row.title))
      row.cells.forEach(function (cell) { line.appendChild(el('td', '', cell)) })
      table.appendChild(line)
      rows[row.id] = line
    })
    return { table: table, rows: rows }
  }

  function buildBlock(stage) {
    var box = el('div', 'block')
    box.appendChild(el('h3', '', stage.title))
    stage.fields.forEach(function (field) {
      box.appendChild(el('span', 'label', field[0]))
      box.appendChild(el('p', '', field[1]))
    })
    return { block: box }
  }

  function fit(parts, state) {
    var ids = state.focus.length ? state.focus : state.visible
    var boxes = ids.map(function (id) { return parts.nodes[id] && parts.nodes[id].box }).filter(Boolean)
    var width = stageBox.clientWidth || 800, height = stageBox.clientHeight || 500
    parts.svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
    if (!boxes.length) boxes = [{ x: 0, y: 0, w: parts.stage.width, h: parts.stage.height }]
    var x1 = Math.min.apply(null, boxes.map(function (b) { return b.x })) - 60
    var y1 = Math.min.apply(null, boxes.map(function (b) { return b.y })) - 60
    var x2 = Math.max.apply(null, boxes.map(function (b) { return b.x + b.w })) + 60
    var y2 = Math.max.apply(null, boxes.map(function (b) { return b.y + b.h })) + 60
    var scale = Math.max(0.35, Math.min(1.15, width / (x2 - x1), height / (y2 - y1)))
    var tx = width / 2 - scale * (x1 + x2) / 2, ty = height / 2 - scale * (y1 + y2) / 2
    parts.camera.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'
  }

  function show() {
    var step = data.steps[index]
    var stage = data.stages[step.stageId]
    var parts = stages[step.stageId]
    if (!parts) {
      parts = stage.type === 'diagram' ? buildDiagram(stage) : stage.type === 'matrix' ? buildMatrix(stage) : buildBlock(stage)
      stages[step.stageId] = parts
    }
    stageBox.textContent = ''
    stageBox.appendChild(parts.svg || parts.table || parts.block)
    var visible = {}, focus = {}
    step.visible.forEach(function (id) { visible[id] = true })
    step.focus.forEach(function (id) { focus[id] = true })
    if (parts.nodes) {
      for (var id in parts.nodes) {
        parts.nodes[id].node.setAttribute('class', 'node' + (!visible[id] ? ' hidden' : focus[id] ? ' focus' : step.focus.length ? ' dim' : ''))
      }
      parts.tokens.textContent = ''
      parts.edges.forEach(function (edge) {
        var shown = (edge.from === '__root__' || visible[edge.from]) && visible[edge.to]
        edge.node.setAttribute('class', edge.node.getAttribute('class').replace(/ hidden/g, '') + (shown ? '' : ' hidden'))
        if (shown && !calm && edge.d && focus[edge.from] && focus[edge.to]) {
          var token = svg('circle', { r: 5, class: 'token' })
          var motion = svg('animateMotion', { path: edge.d, dur: '1.4s', repeatCount: 'indefinite' })
          token.appendChild(motion)
          parts.tokens.appendChild(token)
        }
      })
      fit(parts, step)
    }
    legend.textContent = ''
    if (stage.nodes) {
      var types = {}
      stage.nodes.forEach(function (item) {
        if (!visible[item.id]) return
        if (!types[item.kind]) types[item.kind] = { tone: item.tone, count: 0 }
        types[item.kind].count++
      })
      Object.keys(types).forEach(function (kind) {
        var chip = el('span', 'semantic-' + types[kind].tone)
        chip.appendChild(el('i'))
        chip.appendChild(document.createTextNode(kind + ' ' + types[kind].count))
        legend.appendChild(chip)
      })
    }
    if (parts.rows) {
      for (var rowId in parts.rows) parts.rows[rowId].className = (visible[rowId] ? '' : 'hidden') + (focus[rowId] ? ' focus' : '')
    }
    counter.textContent = (index + 1) + ' / ' + data.steps.length
    heading.textContent = step.title
    narration.textContent = step.narration
    details.textContent = ''
    step.details.forEach(function (item) {
      var box = el('section', 'detail')
      box.appendChild(el('h4', '', item.title))
      if (item.body) box.appendChild(el('p', '', item.body))
      if (item.example) { box.appendChild(el('span', 'label', '例子')); box.appendChild(el('p', '', item.example)) }
      if (item.pitfall) { box.appendChild(el('span', 'label', '常见误区')); box.appendChild(el('p', '', item.pitfall)) }
      details.appendChild(box)
    })
    step.citations.forEach(function (item) {
      var quote = el('blockquote', '', item.quote)
      quote.appendChild(el('cite', '', item.source))
      details.appendChild(quote)
    })
    step.questions.forEach(function (item) {
      var box = el('details', 'check')
      box.appendChild(el('summary', '', '检验：' + item.prompt))
      box.appendChild(el('p', '', item.answer))
      details.appendChild(box)
    })
    if (index === data.steps.length - 1 && data.takeaway) {
      var end = el('section', 'takeaway')
      end.appendChild(el('span', 'label', '一句话结论'))
      end.appendChild(el('p', '', data.takeaway))
      details.appendChild(end)
    }
    previous.disabled = index === 0
    next.disabled = index === data.steps.length - 1
  }

  function go(delta) {
    index = Math.max(0, Math.min(data.steps.length - 1, index + delta))
    show()
  }

  var app = document.getElementById('app')
  var header = el('header')
  var identity = el('div', 'identity')
  identity.appendChild(el('h1', '', data.title))
  if (data.question) identity.appendChild(el('p', 'question', data.question))
  header.appendChild(identity)
  var themeToggle = el('button', 'theme-switch', '☼ 浅色')
  themeToggle.type = 'button'
  themeToggle.setAttribute('aria-label', '切换深色主题')
  themeToggle.addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    themeToggle.textContent = dark ? '☾ 深色' : '☼ 浅色'
    themeToggle.setAttribute('aria-label', dark ? '切换浅色主题' : '切换深色主题')
  })
  header.appendChild(themeToggle)
  var main = el('main')
  var stageBox = el('div', 'stage')
  var visual = el('section', 'visual')
  var legend = el('div', 'legend')
  legend.setAttribute('aria-label', '对象类型图例')
  var side = el('aside')
  var counter = el('span', 'counter')
  var heading = el('h2')
  var narration = el('p', 'narration')
  var details = el('div', 'details')
  var controls = el('div', 'controls')
  var previous = el('button', '', '上一步')
  var next = el('button', 'primary', '下一步')
  previous.type = next.type = 'button'
  previous.addEventListener('click', function () { go(-1) })
  next.addEventListener('click', function () { go(1) })
  controls.appendChild(previous)
  controls.appendChild(counter)
  controls.appendChild(next)
  side.appendChild(heading)
  side.appendChild(narration)
  side.appendChild(details)
  side.appendChild(controls)
  visual.appendChild(stageBox)
  visual.appendChild(legend)
  main.appendChild(visual)
  main.appendChild(side)
  app.appendChild(header)
  app.appendChild(main)
  document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') go(1)
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(-1)
  })
  window.addEventListener('resize', show)
  if (data.steps.length) show()
  else stageBox.appendChild(el('p', 'empty', '这份讲解还没有步骤。'))
})()
