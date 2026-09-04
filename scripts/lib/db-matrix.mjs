/**
 * DragonBones 2.3 仿射矩阵(与官方 ObjectDataParser._parseTransform 一致)
 * skY -> rotation, skX - skY -> skew
 */
const DEG = Math.PI / 180;

export function transformToMatrix(t) {
  const x = t.x ?? 0;
  const y = t.y ?? 0;
  const scX = t.scX ?? 1;
  const scY = t.scY ?? 1;
  const skY = (t.skY ?? 0) * DEG;
  const skX = (t.skX ?? 0) * DEG;
  const rotation = skY;
  const skew = skX - skY;

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const cosS = Math.cos(skew + rotation);
  const sinS = Math.sin(skew + rotation);

  return {
    a: cosR * scX,
    b: sinR * scX,
    c: -sinS * scY,
    d: cosS * scY,
    tx: x,
    ty: y,
  };
}

export function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

export function multiplyMatrix(parent, child) {
  return {
    a: parent.a * child.a + parent.b * child.c,
    b: parent.a * child.b + parent.b * child.d,
    c: parent.c * child.a + parent.d * child.c,
    d: parent.c * child.b + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

export function applyMatrix(ctx, m) {
  ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
}

/** 2D 仿射逆矩阵，用于 MC20 面包局部坐标换算 */
export function invertMatrix(m) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-10) return identityMatrix();
  const inv = 1 / det;
  const a = m.d * inv;
  const b = -m.b * inv;
  const c = -m.c * inv;
  const d = m.a * inv;
  return {
    a,
    b,
    c,
    d,
    tx: -(a * m.tx + c * m.ty),
    ty: -(b * m.tx + d * m.ty),
  };
}