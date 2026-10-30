import { Geometry, GlProgram, Mesh, Shader, type DestroyOptions } from 'pixi.js';

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec4 aColor;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
void main(void) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  // uColor / uWorldColorAlpha 已預乘透明度（Container 的 tint、alpha）
  vColor = vec4(aColor.rgb, 1.0) * uColor * uWorldColorAlpha;
}
`;

const FRAGMENT = /* glsl */ `
in vec4 vColor;
out vec4 finalColor;
void main(void) {
  finalColor = vColor;
}
`;

/** 所有角色共用的著色器（每個面一個顏色，沒有貼圖） */
let shared: Shader | null = null;
const facetShader = () => (shared ??= new Shader({ glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'facet-mesh' }), resources: {} }));

/**
 * 多面體角色的畫布：每幀把投影好的面（凸多邊形）寫進固定的緩衝區，由遠到近排好後一次畫出。
 * 取代每個面一次 Graphics.poly().fill()——那樣 Pixi 每幀都要重新切三角形、產生大量暫存物件。
 * 用法：begin() → 每個面 open() / point() × n / close(depth, color) → end()。
 */
export class FacetMesh extends Mesh<Geometry, Shader> {
  private positions: Float32Array;
  /** 每個頂點的顏色（RGBA 各 1 byte，little-endian：0xAABBGGRR）；colorBytes 是同一塊記憶體 */
  private colors: Uint32Array;
  private colorBytes: Uint8Array;
  private indices: Uint32Array;
  private vertexCount = 0;
  private faceStart = 0;
  /** 上一幀用到的頂點 / 索引數：這一幀用得比較少時把多出來的歸零（不畫、不影響邊界） */
  private lastVertices = 0;
  private lastIndices = 0;
  private readonly starts: number[] = [];
  private readonly depths: number[] = [];
  private readonly order: number[] = [];

  constructor() {
    const positions = new Float32Array(2 * 1024);
    const colors = new Uint32Array(1024);
    const colorBytes = new Uint8Array(colors.buffer);
    const indices = new Uint32Array(3 * 1024);
    super({
      geometry: new Geometry({
        attributes: {
          aPosition: { buffer: positions, format: 'float32x2' },
          aColor: { buffer: colorBytes, format: 'unorm8x4' },
        },
        indexBuffer: indices,
      }),
      shader: facetShader(),
    });
    this.positions = positions;
    this.colors = colors;
    this.colorBytes = colorBytes;
    this.indices = indices;
  }

  /** 面的數量（除錯、測量用） */
  get faceCount(): number {
    return this.starts.length;
  }

  begin(): void {
    this.vertexCount = 0;
    this.starts.length = 0;
    this.depths.length = 0;
  }

  open(): void {
    this.faceStart = this.vertexCount;
  }

  point(x: number, y: number): void {
    if (this.vertexCount >= this.colors.length) this.grow();
    const i = this.vertexCount++;
    this.positions[i * 2] = x;
    this.positions[i * 2 + 1] = y;
  }

  close(depth: number, color: number): void {
    const abgr = (0xff000000 | ((color & 0xff) << 16) | (color & 0xff00) | ((color >> 16) & 0xff)) >>> 0;
    this.colors.fill(abgr, this.faceStart, this.vertexCount);
    this.starts.push(this.faceStart);
    this.depths.push(depth);
  }

  /** 由遠到近排序、切成扇形三角形並上傳 */
  end(): void {
    const { starts, depths, order } = this;
    const faces = starts.length;
    order.length = faces;
    for (let i = 0; i < faces; i++) order[i] = i;
    order.sort((a, b) => depths[a]! - depths[b]!);
    const triangles = this.vertexCount - 2 * faces;
    if (triangles * 3 > this.indices.length) this.growIndices(triangles * 3);
    const indices = this.indices;
    let n = 0;
    for (const f of order) {
      const s = starts[f]!;
      const e = f + 1 < faces ? starts[f + 1]! : this.vertexCount;
      for (let v = s + 1; v < e - 1; v++) {
        indices[n++] = s;
        indices[n++] = v;
        indices[n++] = v + 1;
      }
    }
    if (n < this.lastIndices) indices.fill(0, n, this.lastIndices);
    if (this.vertexCount < this.lastVertices) {
      this.positions.fill(0, this.vertexCount * 2, this.lastVertices * 2);
      this.colors.fill(0, this.vertexCount, this.lastVertices);
    }
    const vertices = Math.max(this.vertexCount, this.lastVertices);
    const geometry = this.geometry;
    geometry.getBuffer('aPosition').setDataWithSize(this.positions, vertices * 2, true);
    geometry.getBuffer('aColor').setDataWithSize(this.colorBytes, vertices * 4, true);
    geometry.indexBuffer.setDataWithSize(indices, Math.max(n, this.lastIndices), true);
    this.lastVertices = this.vertexCount;
    this.lastIndices = n;
  }

  /** 依畫的順序走過每個面的頂點（畫除錯邊線用） */
  forEachFace(visit: (points: number[]) => void): void {
    const { starts, order } = this;
    for (const f of order) {
      const s = starts[f]!;
      const e = f + 1 < starts.length ? starts[f + 1]! : this.vertexCount;
      visit(Array.from(this.positions.subarray(s * 2, e * 2)));
    }
  }

  private grow(): void {
    const capacity = this.colors.length * 2;
    const positions = new Float32Array(capacity * 2);
    positions.set(this.positions);
    const colors = new Uint32Array(capacity);
    colors.set(this.colors);
    this.positions = positions;
    this.colors = colors;
    this.colorBytes = new Uint8Array(colors.buffer);
    this.lastVertices = 0;
    this.geometry.getBuffer('aPosition').data = positions;
    this.geometry.getBuffer('aColor').data = this.colorBytes;
  }

  private growIndices(needed: number): void {
    let capacity = this.indices.length;
    while (capacity < needed) capacity *= 2;
    this.indices = new Uint32Array(capacity);
    this.lastIndices = 0;
    this.geometry.indexBuffer.data = this.indices;
  }

  override destroy(options?: DestroyOptions): void {
    const geometry = this.geometry;
    super.destroy(options);
    geometry.destroy(true);
  }
}
