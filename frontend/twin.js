const colors = {
  floor: '#161d2b', frame: '#343e52', steel: '#77869e', dark: '#202939', belt: '#2b3444',
  purple: '#8670ce', purpleLight: '#bda4fa', orange: '#e7a467', teal: '#65c7b1', white: '#c4cddd'
};

function shade(hex, factor) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map(shift => Math.min(255, Math.round(((value >> shift) & 255) * factor))).join(',')})`;
}

export class FactoryTwin {
  constructor(canvas, assets, onSelect) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.assets = assets;
    this.onSelect = onSelect;
    this.angle = -0.58;
    this.pitch = 0.63;
    this.zoom = 1;
    this.playing = true;
    this.selected = 'pressure';
    this.scenarioId = 'pressure';
    this.layer = 'status';
    this.time = 0;
    this.destroyed = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', event => { this.drag = { x: event.clientX, startX: event.clientX, y: event.clientY, angle: this.angle }; canvas.setPointerCapture(event.pointerId); }, options);
    canvas.addEventListener('pointermove', event => { if (this.drag) { this.angle = this.drag.angle + (event.clientX - this.drag.x) * 0.005; this.render(); } }, options);
    canvas.addEventListener('pointerup', event => {
      if (this.drag && Math.abs(event.clientX - this.drag.startX) < 5 && Math.abs(event.clientY - this.drag.y) < 5) {
        const rect = canvas.getBoundingClientRect();
        const position = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const hit = this.hitAreas?.find(area => Math.abs(area.x - position.x) < 64 && Math.abs(area.y - position.y) < 46);
        if (hit) this.onSelect(hit.id);
      }
      this.drag = null;
    }, options);
    canvas.addEventListener('pointercancel', () => { this.drag = null; }, options);
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.setZoom(this.zoom - event.deltaY * 0.001); }, { ...options, passive: false });
    canvas.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.angle += event.key === 'ArrowLeft' ? -0.1 : 0.1; this.render(); }
      if (event.key === '+' || event.key === '=') this.setZoom(this.zoom + 0.1);
      if (event.key === '-') this.setZoom(this.zoom - 0.1);
    }, options);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.tick = timestamp => {
      if (this.destroyed) return;
      if (timestamp - (this.lastFrame || 0) > 40 && !document.hidden) {
        if (this.playing && !this.reducedMotion) this.time += 0.035;
        this.render();
        this.lastFrame = timestamp;
      }
      this.frame = requestAnimationFrame(this.tick);
    };
    this.frame = requestAnimationFrame(this.tick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.render();
  }

  setZoom(value) { this.zoom = Math.max(0.65, Math.min(1.8, value)); this.render(); }
  reset() { this.angle = -0.58; this.zoom = 1; this.render(); }
  setScenario(scenario) { this.scenarioId = scenario.id; this.selected = scenario.assetId; this.render(); }
  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.abort.abort(); }

  project([horizontal, vertical, depth]) {
    const rotatedX = horizontal * Math.cos(this.angle) - depth * Math.sin(this.angle);
    const rotatedZ = horizontal * Math.sin(this.angle) + depth * Math.cos(this.angle);
    const scale = Math.min(this.width / 1120, this.height / 620) * this.zoom;
    return { x: this.width / 2 + rotatedX * scale, y: this.height * 0.61 + (rotatedZ * Math.sin(this.pitch) - vertical * Math.cos(this.pitch)) * scale, depth: rotatedZ * Math.cos(this.pitch) + vertical * Math.sin(this.pitch) };
  }

  polygon(points, fill, stroke = '#ffffff0a') {
    const projected = points.map(point => this.project(point));
    this.faces.push({ points: projected, depth: projected.reduce((sum, point) => sum + point.depth, 0) / projected.length, fill, stroke });
  }

  box(horizontal, vertical, depth, width, height, length, color, edge) {
    const left = horizontal - width / 2, right = horizontal + width / 2;
    const back = depth - length / 2, front = depth + length / 2, top = vertical + height;
    this.polygon([[left, vertical, back], [right, vertical, back], [right, top, back], [left, top, back]], shade(color, 0.63), edge);
    this.polygon([[right, vertical, back], [right, vertical, front], [right, top, front], [right, top, back]], shade(color, 0.78), edge);
    this.polygon([[left, vertical, front], [right, vertical, front], [right, top, front], [left, top, front]], shade(color, 0.9), edge);
    this.polygon([[left, vertical, back], [left, vertical, front], [left, top, front], [left, top, back]], shade(color, 0.7), edge);
    this.polygon([[left, top, back], [right, top, back], [right, top, front], [left, top, front]], shade(color, 1.12), edge);
  }

  tube(start, end, radius, color, segments = 10) {
    const vector = end.map((value, index) => value - start[index]);
    const magnitude = Math.hypot(...vector);
    const axis = vector.map(value => value / magnitude);
    const reference = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (first, second) => [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
    const normal = cross(axis, reference);
    const normalLength = Math.hypot(...normal);
    const basis = normal.map(value => value / normalLength);
    const perpendicular = cross(axis, basis);
    const ring = center => Array.from({ length: segments }, (_, index) => center.map((value, coordinate) => value + radius * (Math.cos(index * Math.PI * 2 / segments) * basis[coordinate] + Math.sin(index * Math.PI * 2 / segments) * perpendicular[coordinate])));
    const firstRing = ring(start), secondRing = ring(end);
    for (let index = 0; index < segments; index++) this.polygon([firstRing[index], firstRing[(index + 1) % segments], secondRing[(index + 1) % segments], secondRing[index]], shade(color, 0.72 + 0.24 * Math.cos(index * Math.PI * 2 / segments)));
    this.polygon(firstRing, shade(color, 1.15));
    this.polygon(secondRing, shade(color, 1.08));
  }

  line(points, color, width = 1, dash = []) {
    const context = this.context;
    context.beginPath();
    points.forEach((point, index) => { const projected = this.project(point); index ? context.lineTo(projected.x, projected.y) : context.moveTo(projected.x, projected.y); });
    context.strokeStyle = color; context.lineWidth = width; context.setLineDash(dash); context.stroke(); context.setLineDash([]);
  }

  machineColor(asset, normal) {
    if (this.layer === 'energy') return asset === 'power' ? '#e9af6d' : '#668e95';
    if (this.layer === 'flow') return '#7590cf';
    return normal;
  }

  build() {
    this.faces = [];
    this.box(0, -10, 15, 925, 10, 435, colors.floor);
    this.floorFaces = this.faces.splice(0);
    for (const horizontal of [-360, -180, 0, 180, 360]) {
      this.box(horizontal, 0, -80, 7, 45, 8, colors.frame);
      this.box(horizontal, 0, -15, 7, 45, 8, colors.frame);
    }
    for (let horizontal = -400; horizontal <= 400; horizontal += 20) {
      this.box(horizontal, 40, -48, 20, 13, 72, colors.frame);
      this.box(horizontal, 54, -48, 20, 4, 61, colors.belt);
      this.box(horizontal, 57, -85, 20, 5, 4, colors.steel);
      this.box(horizontal, 57, -11, 20, 5, 4, colors.steel);
    }
    for (let horizontal = -390; horizontal < 410; horizontal += 18) this.tube([horizontal, 60, -79], [horizontal, 60, -17], 2.7, colors.steel, 6);
    for (let index = 0; index < 8; index++) {
      const horizontal = -385 + ((index * 101 + this.time * 22) % 780);
      this.box(horizontal, 65, -48, 27, 17, 29, index % 3 === 0 ? colors.purpleLight : '#7f8a9e');
      this.box(horizontal, 83, -48, 17, 3, 19, colors.dark);
    }
    this.box(-317, 0, -87, 117, 7, 133, colors.frame);
    this.box(-345, 7, -119, 63, 97, 57, this.machineColor('feed', colors.purple));
    this.box(-345, 104, -119, 67, 5, 61, colors.purpleLight);
    this.box(-345, 53, -88, 40, 31, 2, colors.dark);
    this.box(-345, 62, -86, 29, 15, 2, '#567c85');
    this.box(-310, 9, -138, 18, 127, 15, colors.steel);
    this.box(-310, 133, -77, 18, 13, 137, colors.steel);
    this.box(-310, 114, -48, 27, 18, 28, colors.dark);
    this.tube([-310, 98, -48], [-310, 115, -48], 8, colors.steel);
    this.box(-96, 0, -60, 145, 8, 145, colors.frame);
    this.tube([-100, 8, -133], [-100, 40, -133], 29, colors.dark);
    this.tube([-100, 40, -133], [-100, 55, -133], 24, colors.orange);
    const motion = Math.sin(this.time) * 13;
    this.tube([-100, 55, -133], [-138, 114, -115], 15, colors.orange);
    this.tube([-148, 114, -115], [-128, 114, -115], 20, colors.dark);
    this.tube([-138, 114, -115], [-82 + motion, 153, -54], 12, colors.orange);
    this.tube([-82 + motion, 153, -54], [-69 + motion, 121, -46], 10, colors.orange);
    this.tube([-69 + motion, 120, -46], [-69 + motion, 105, -46], 8, colors.dark);
    this.box(-76 + motion, 95, -46, 4, 12, 19, colors.steel);
    this.box(-63 + motion, 95, -46, 4, 12, 19, colors.steel);
    for (const horizontal of [-177, -18]) {
      this.box(horizontal, 0, -150, 4, 105, 4, colors.frame);
      this.box(horizontal, 0, 30, 4, 86, 4, colors.frame);
      this.box(horizontal, 83, -60, 3, 3, 180, colors.steel);
      for (let position = -140; position < 30; position += 17) this.box(horizontal, 6, position, 1, 74, 1, '#384253');
    }
    this.box(-93, 0, 137, 102, 6, 70, colors.frame);
    this.tube([-123, 7, 139], [-123, 75, 139], 21, this.machineColor('pressure', colors.purple));
    this.tube([-77, 7, 139], [-77, 75, 139], 21, this.machineColor('pressure', colors.purple));
    this.box(-100, 76, 139, 62, 10, 10, colors.steel);
    this.tube([-100, 87, 139], [-100, 95, 139], 7, colors.teal);
    this.box(-146, 14, 120, 15, 39, 24, colors.dark);
    this.box(-146, 39, 134, 11, 8, 2, colors.orange);
    this.tube([-100, 16, 110], [-100, 16, 35], 3, '#a98b68');
    this.tube([-100, 16, 35], [-100, 45, 35], 3, '#a98b68');
    for (const horizontal of [98, 193]) {
      this.box(horizontal, 0, -96, 13, 133, 13, this.machineColor('vision', colors.purple));
      this.box(horizontal, 0, -5, 13, 133, 13, this.machineColor('vision', colors.purple));
    }
    this.box(146, 129, -51, 115, 21, 106, this.machineColor('vision', colors.purple));
    this.box(146, 151, -51, 100, 4, 95, colors.purpleLight);
    this.box(146, 108, -51, 36, 18, 34, colors.dark);
    this.box(146, 104, -51, 22, 4, 23, colors.teal);
    this.box(201, 82, -7, 30, 27, 8, colors.dark);
    this.box(201, 87, -1, 23, 17, 2, '#608e93');
    this.box(330, 0, -72, 116, 8, 135, colors.frame);
    this.box(363, 8, -96, 53, 100, 62, this.machineColor('pack', colors.purple));
    this.box(363, 109, -96, 57, 5, 66, colors.purpleLight);
    this.box(310, 8, -138, 16, 106, 16, colors.steel);
    this.box(310, 110, -81, 18, 11, 129, colors.steel);
    this.tube([310, 85, -48], [310, 110, -48], 5, colors.steel);
    this.box(310, 80, -48, 33, 8, 30, colors.dark);
    this.box(324, 8, -14, 25, 33, 17, colors.dark);
    this.box(330, 42, -14, 20, 3, 10, colors.teal);
    this.box(209, 0, 152, 102, 7, 59, colors.frame);
    this.box(209, 7, 152, 89, 100, 47, this.machineColor('power', '#515d77'));
    this.box(209, 108, 152, 93, 4, 51, colors.steel);
    this.box(209, 28, 177, 76, 66, 2, '#333e52');
    this.box(227, 77, 179, 22, 12, 2, '#80a9ac');
    for (let vertical = 38; vertical < 70; vertical += 6) this.box(195, vertical, 180, 28, 2, 2, colors.steel);
    for (const horizontal of [171, 248]) this.box(horizontal, 11, 180, 2, 90, 2, '#8690a2');
    this.box(-223, 0, 105, 57, 5, 52, colors.frame);
    this.box(-223, 5, 105, 47, 39, 42, '#79727d');
    this.box(-223, 45, 105, 48, 2, 43, '#a89891');
    this.box(-223, 46, 105, 10, 1, 43, '#d0b192');
    for (const asset of this.assets) {
      const active = asset.id === (this.scenarioId === 'pressure' ? 'pressure' : 'power');
      this.tube([asset.x + 39, 5, asset.z], [asset.x + 39, 72, asset.z], 2.5, colors.steel, 6);
      this.tube([asset.x + 39, 72, asset.z], [asset.x + 39, 80, asset.z], 4, active ? '#edab74' : colors.teal, 8);
    }
  }

  render() {
    if (!this.width || !this.height || this.destroyed) return;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const glow = context.createRadialGradient(this.width * 0.5, this.height * 0.54, 10, this.width * 0.5, this.height * 0.54, this.width * 0.55);
    glow.addColorStop(0, '#8f77d612'); glow.addColorStop(1, '#8f77d600');
    context.fillStyle = glow; context.fillRect(0, 0, this.width, this.height);
    for (let horizontal = -600; horizontal <= 600; horizontal += 40) this.line([[horizontal, -12, -460], [horizontal, -12, 420]], '#68748f0c');
    for (let depth = -460; depth <= 420; depth += 40) this.line([[-600, -12, depth], [600, -12, depth]], '#68748f0c');
    this.build();
    this.faces.sort((first, second) => first.depth - second.depth);
    for (const face of [...this.floorFaces.sort((first, second) => first.depth - second.depth), ...this.faces]) {
      context.beginPath(); face.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.closePath();
      context.fillStyle = face.fill; context.fill(); context.strokeStyle = face.stroke; context.lineWidth = 0.55; context.stroke();
    }
    this.line([[-440, 1, 213], [440, 1, 213]], '#b29aff35');
    this.line([[-440, 1, -182], [440, 1, -182]], '#b29aff25');
    this.line([[-425, 1, 46], [417, 1, 46]], '#d5bb782a', 1, [5, 5]);
    const activeAsset = this.assets.find(asset => asset.id === this.selected);
    if (activeAsset) {
      const points = Array.from({ length: 65 }, (_, index) => [activeAsset.x + Math.cos(index / 64 * Math.PI * 2) * 69, 2, activeAsset.z + Math.sin(index / 64 * Math.PI * 2) * 54]);
      this.line(points, '#b6a0ff', 1.5, [5, 3]);
    }
    if (this.layer === 'flow') {
      for (let index = 0; index < 5; index++) {
        const horizontal = -300 + index * 140;
        this.line([[horizontal, 90, -48], [horizontal + 80, 90, -48]], '#a8c7ff', 2);
        this.line([[horizontal + 67, 90, -58], [horizontal + 80, 90, -48], [horizontal + 67, 90, -38]], '#a8c7ff', 2);
      }
    }
    if (this.scenarioId === 'pressure' && this.layer === 'status') this.line([[-100, 87, 139], [-100, 87, 35], [-95, 115, -90]], '#edae7655', 1.2, [4, 5]);
    this.hitAreas = [];
    for (const asset of this.assets) {
      const isSelected = asset.id === this.selected;
      const isRisk = asset.id === (this.scenarioId === 'pressure' ? 'pressure' : 'power');
      const label = this.project([asset.x, asset.id === 'pressure' ? 112 : asset.id === 'power' ? 138 : 185, asset.z]);
      const anchor = this.project([asset.x, asset.id === 'pressure' ? 84 : asset.id === 'power' ? 110 : 148, asset.z]);
      context.beginPath(); context.moveTo(label.x, label.y + 12); context.lineTo(anchor.x, anchor.y); context.strokeStyle = isRisk ? '#dfa47560' : '#b2a5dd30'; context.stroke();
      const width = context.measureText(asset.code).width + 35;
      context.beginPath(); context.roundRect(label.x - width / 2, label.y - 11, width, 23, 5);
      context.fillStyle = isSelected ? '#292139ed' : '#11151eea'; context.fill(); context.strokeStyle = isSelected ? '#ac91f68c' : '#66708645'; context.lineWidth = 1; context.stroke();
      context.beginPath(); context.arc(label.x - width / 2 + 10, label.y + 0.5, 2.4, 0, Math.PI * 2); context.fillStyle = isRisk ? '#eeac78' : '#80c6b1'; context.fill();
      context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'; context.fillStyle = isSelected ? '#e1d5ff' : '#b2b8c9'; context.textAlign = 'left'; context.fillText(asset.code, label.x - width / 2 + 19, label.y + 4);
      this.hitAreas.push({ id: asset.id, x: label.x, y: label.y });
    }
    context.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'; context.textAlign = 'center';
    const floorLabel = this.project([-250, 2, 193]); context.fillStyle = '#7c789780'; context.fillText('ASSEMBLY LINE 01  /  DIGITAL REPLICA', floorLabel.x, floorLabel.y);
  }
}
