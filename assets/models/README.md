# assets/models/ — meubles 3D (Kenney Furniture Kit 2.0, CC0)

Les fichiers `*.glb.b64` sont les modèles GLB originaux de Kenney,
encodés en base64 (une seule ligne, sans retours à la ligne).

Pourquoi base64 ? Le push GitHub utilisé pour ce repo est texte-only
(les fichiers binaires sont refusés), donc les GLB sont stockés encodés.
`room3d.js` (`loadModels()`) les récupère, les décode avec `atob()` et
les parse avec `THREE.GLTFLoader` — le résultat est byte-identique au
GLB original.

Pour retrouver le GLB original :
  base64 -d desk.glb.b64 > desk.glb
  (ou sur Windows PowerShell : certutil -decode desk.glb.b64 desk.glb)

Modèles : desk, chairDesk, bookcaseOpen, kitchenCabinet, table,
loungeSofa, pottedPlant, lampRoundFloor, books, laptop.
Source : https://kenney.nl/assets/furniture-kit — licence CC0,
voir LICENSE-Kenney.txt. Si un jour les vrais .glb sont poussés par
git classique, il suffit de remettre les URLs `.glb` dans
`Room3D.MODEL_DEFS` (room3d.js) et de charger en arraybuffer.
