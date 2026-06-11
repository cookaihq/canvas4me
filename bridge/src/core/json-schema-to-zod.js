// JSON Schema → ZodRawShape（运行时无关的纯转换）。
// SDK 的 registerTool 接受「扁平的 field→zod 映射」(ZodRawShape) 作为 inputSchema。
// 页面用 JSON Schema 声明工具入参，这里把顶层 object schema 的每个属性转成 zod 校验器。
// 只覆盖工具实际用到的形态，保持最小：string/number/integer/boolean/object/array + enum + required。
// 无法识别的形态回退到 z.any()，保证「能注册、不丢工具」优先于「严格校验」。

import { z } from 'zod'

export function jsonSchemaToZodRawShape(schema) {
  // 无 schema / 非对象 → 无参工具。
  if (!schema || typeof schema !== 'object') return {}
  // 顶层必须是 object；否则当作无参（桥不强加结构）。
  if (schema.type && schema.type !== 'object') return {}

  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])

  const shape = {}
  for (const [key, propSchema] of Object.entries(properties)) {
    let v = jsonSchemaPropToZod(propSchema)
    if (propSchema && typeof propSchema.description === 'string') {
      v = v.describe(propSchema.description)
    }
    if (!required.has(key)) {
      v = v.optional()
    }
    shape[key] = v
  }
  return shape
}

// 把单个 JSON Schema 属性转成 zod 校验器（最小覆盖）。
function jsonSchemaPropToZod(prop) {
  if (!prop || typeof prop !== 'object') return z.any()

  // enum：用 z.enum（全字符串）/ 否则退化为 z.any()（值域混杂不强校验）。
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    if (prop.enum.every((e) => typeof e === 'string')) {
      return z.enum(prop.enum)
    }
    return z.any()
  }

  switch (prop.type) {
    case 'string':
      return z.string()
    case 'number':
      return z.number()
    case 'integer':
      return z.number().int()
    case 'boolean':
      return z.boolean()
    case 'array': {
      const items = prop.items && typeof prop.items === 'object' ? jsonSchemaPropToZod(prop.items) : z.any()
      return z.array(items)
    }
    case 'object': {
      // 有明确 properties → 转成嵌套 object（passthrough 容忍额外键）；
      // 否则当作任意键值对（z.record）。
      if (prop.properties && typeof prop.properties === 'object') {
        const nested = jsonSchemaToZodRawShape(prop)
        return z.object(nested).passthrough()
      }
      return z.record(z.string(), z.any())
    }
    default:
      // type 缺省 / 未知 → 不强校验。
      return z.any()
  }
}
