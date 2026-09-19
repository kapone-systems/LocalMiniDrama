import { PRESET_PACKS, PACK_GROUPS } from './catalog.js'
import pack302 from './packs/302ai-302.json'
import packFfir from './packs/飞儿api-ffir.cn.json'
import packYunwu from './packs/云雾ai.json'
import packN1n from './packs/n1n.json'
import packGeek from './packs/geeknow.json'
import packVector from './packs/向量.json'

const FILE_PACKS = {
  '302ai-302': pack302,
  '飞儿api-ffir.cn': packFfir,
  '云雾ai': packYunwu,
  n1n: packN1n,
  geeknow: packGeek,
  向量: packVector,
}

export function resolvePackConfigs(pack) {
  if (pack.configs?.length) return pack.configs
  if (pack.file && FILE_PACKS[pack.file]) return FILE_PACKS[pack.file]
  return []
}

export { PRESET_PACKS, PACK_GROUPS }
