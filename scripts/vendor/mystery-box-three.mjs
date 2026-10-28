// Bundle only the Three.js exports used by the local Mystery Box renderer.
export {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, CanvasTexture, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight,
  LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera,
  PCFSoftShadowMap, PlaneGeometry, PMREMGenerator, PointLight, RepeatWrapping,
  Scene, ShaderMaterial, ShadowMaterial, SpotLight, SRGBColorSpace, TextureLoader, Vector3,
  WebGLRenderer,
} from 'three';
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
