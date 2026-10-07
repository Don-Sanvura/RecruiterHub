export function mountNeuralNetwork(canvas) {
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.dataset.sceneState = 'fallback';
    return () => {};
  }

  let width = 0;
  let height = 0;
  let scale = 1;
  let nodes = [];
  let edges = [];
  let frame = 0;
  let time = 0;
  let targetScroll = 0;
  let scrollOffset = 0;
  let pointerX = 0;
  let pointerY = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function createGraph() {
    const columns = Math.max(3, Math.round(width / 145));
    const rows = Math.max(5, Math.ceil(height / 132));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    nodes = [];

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const phase = Math.random() * Math.PI * 2;
        nodes.push({
          x: (column + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.42,
          y: (row + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.42,
          phase,
          size: Math.random() > 0.88 ? 3.1 : 1.5 + Math.random() * 0.8,
          accent: Math.random() > 0.83
        });
      }
    }

    const candidates = [];
    const maxDistance = Math.max(cellWidth, cellHeight) * 1.55;
    for (let from = 0; from < nodes.length; from++) {
      for (let to = from + 1; to < nodes.length; to++) {
        const dx = nodes[from].x - nodes[to].x;
        const dy = nodes[from].y - nodes[to].y;
        const distance = Math.hypot(dx, dy);
        if (distance < maxDistance) candidates.push({ from, to, distance, phase: Math.random() });
      }
    }

    candidates.sort((left, right) => left.distance - right.distance);
    const degree = new Uint8Array(nodes.length);
    edges = [];
    for (const edge of candidates) {
      if (degree[edge.from] >= 4 || degree[edge.to] >= 4) continue;
      edges.push(edge);
      degree[edge.from]++;
      degree[edge.to]++;
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    createGraph();
    draw(time);
  }

  function draw(timestamp) {
    time = timestamp;
    if (reducedMotion) scrollOffset = targetScroll;
    else scrollOffset += (targetScroll - scrollOffset) * 0.08;

    context.fillStyle = 'rgba(6, 12, 17, 0.94)';
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1;
    context.globalCompositeOperation = 'source-over';

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index];
      const from = nodes[edge.from];
      const to = nodes[edge.to];
      const fromX = from.x + pointerX;
      const fromY = from.y - scrollOffset + pointerY;
      const toX = to.x + pointerX;
      const toY = to.y - scrollOffset + pointerY;
      const pulse = (time * 0.00012 + edge.phase + targetScroll * 0.0014) % 1;
      context.strokeStyle = `rgba(75, 185, 211, ${0.12 + (index % 4 === 0 ? 0.08 : 0)})`;
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.lineTo(toX, toY);
      context.stroke();

      if (index % 3 === 0) {
        const pulseX = fromX + (toX - fromX) * pulse;
        const pulseY = fromY + (toY - fromY) * pulse;
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = pulse > 0.82 ? 'rgba(192, 245, 129, 0.85)' : 'rgba(111, 226, 243, 0.9)';
        context.shadowColor = context.fillStyle;
        context.shadowBlur = 12;
        context.beginPath();
        context.arc(pulseX, pulseY, 1.8, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.globalCompositeOperation = 'source-over';
      }
    }

    for (const node of nodes) {
      const x = node.x + pointerX;
      const y = node.y - scrollOffset + pointerY + Math.sin(time * 0.00055 + node.phase) * 2.5;
      const breath = 0.68 + (Math.sin(time * 0.001 + node.phase) + 1) * 0.16;
      context.fillStyle = node.accent ? `rgba(196, 244, 129, ${breath})` : `rgba(107, 220, 241, ${breath})`;
      context.shadowColor = context.fillStyle;
      context.shadowBlur = node.size > 2.5 ? 15 : 8;
      context.beginPath();
      context.arc(x, y, node.size, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }

    if (!reducedMotion) frame = requestAnimationFrame(draw);
  }

  function onScroll() {
    const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    targetScroll = Math.min(window.scrollY / scrollRange, 1) * height * 0.2;
    if (reducedMotion) draw(time);
  }

  function onPointerMove(event) {
    pointerX = (event.clientX / width - 0.5) * 12;
    pointerY = (event.clientY / height - 0.5) * 8;
    if (reducedMotion) draw(time);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  resize();
  if (!reducedMotion) frame = requestAnimationFrame(draw);
  canvas.dataset.sceneState = 'ready';

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onPointerMove);
  };
}