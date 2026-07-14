const DANGEROUS_TAGS = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'textarea', 'select', 'button', 'base', 'meta', 'link',
  'svg', 'math'
]

const URI_ATTRIBUTES = new Set([
  'href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'background', 'cite'
])

const DANGEROUS_CSS = /(?:expression\s*\(|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|@import|-moz-binding|behavior\s*:)/i

function isDangerousUrl(value, attrName) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .toLowerCase()

  if (/^(?:javascript|vbscript|file):/.test(normalized)) return true
  if (normalized.startsWith('blob:')) return true
  if (normalized.startsWith('data:')) {
    return !(attrName === 'src' && /^data:image\/(?:png|gif|jpe?g|webp|bmp);/i.test(normalized))
  }
  return false
}

export function sanitizeEmailHtml(html) {
  if (!html) return ''

  const document = new DOMParser().parseFromString(String(html), 'text/html')

  document.querySelectorAll(DANGEROUS_TAGS.join(',')).forEach(element => element.remove())

  document.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value

      if (name.startsWith('on') || ['srcdoc', 'ping', 'autofocus', 'contenteditable'].includes(name)) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (URI_ATTRIBUTES.has(name) && isDangerousUrl(value, name)) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (name === 'style' && DANGEROUS_CSS.test(value)) {
        element.removeAttribute(attribute.name)
      }
    }

    if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer')
    }
  })

  document.querySelectorAll('style').forEach(style => {
    if (DANGEROUS_CSS.test(style.textContent || '')) style.remove()
  })

  const styles = [...document.head.querySelectorAll('style')].map(style => style.outerHTML).join('')
  return styles + document.body.innerHTML
}
