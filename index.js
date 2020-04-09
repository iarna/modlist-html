#!/usr/bin/env node
require('@iarna/cli')(main)
  .usage('$0 modlist.txt modfolder/ > output.html')
  .demand(2)

const fs = require('fs')
const fun = require('funstream')
const ini = require('ini')
const bbobHTML = require('@bbob/html/')
const presetHTML5 = require('@bbob/preset-html5')
const marked = require('marked')
const qr = require('@perl/qr')

marked.setOptions({
  gfm: true,
  breaks: true,
  smartLists: true
})

const gameToSlug = {
  Skyrim: 'skyrim',
  SkyrimSE: 'skyrimspecialedition'
}

const mergeColors = [
  '#ffc0c0',
  '#fffbbf',
  '#cdffc0',
  '#bfffe9',
  '#bfe1ff',
  '#d5c0ff',
  '#ffbff3',
  '#ffc3bf',
  '#fffbbf',
  '#cdffbf',
  '#bfffe9',
  '#c0e1ff',
  '#d5c0ff',
  '#ffbff3',
  '#ffcbbf',
  '#fcffbf',
  '#c5ffbf',
  '#bffff0',
  '#c0d9ff',
  '#ddbfff',
  '#ffbfeb',
]

function readmeta (moddir, mod) {
  try {
    return ini.parse(fs.readFileSync(moddir + '/' + mod + '/meta.ini', 'utf8')).General
  } catch (_) {
    return {}
  }
}
function readesps (moddir, mod) {
  try {
    return fs.readdirSync(moddir + '/' + mod).filter(_ => /[.]es[mpl]$/.test(_))
  } catch (_) {
console.error(_)
    return []
  }
}
function readmerge (moddir, mod) {
  try {
    return JSON.parse(fs.readFileSync(moddir + '/' + mod + '/merge - ' + mod + '/merge.json'))
  } catch (_) {
    return
  }
}

async function main (opts, modlist, moddir) {
  const list = await fun(fs.createReadStream(modlist, 'utf8')).lines().list()
  list.reverse()
  const mods = {}
  const espindex = {}
  let merges = -1
  let order = -1
  for (let line of list) {
    ++ order
    if (/^-(.*)_separator$/.test(line)) {
      const cat = line.slice(1,-10)
      mods[cat] = {order, name: cat, isCategory: true}
   } else if (/^-/.test(line)) {
      continue
    } else if (/^[+]/.test(line)) {
      const mod = line.slice(1)
      const meta = readmeta(moddir, mod)
      const mergemeta = readmerge(moddir, mod)
      const esps = readesps(moddir, mod)
      const slug = gameToSlug[meta.gameName]
      const id = Number(meta.modid)
      const url = (id && slug && `https://www.nexusmods.com/${slug}/mods/${id}`) || meta.url
      const comments = meta.comments
      let notes
      if (meta.notes) {
        notes = marked(meta.notes.replace(qr.i.g`^(\n|.)*<body[^>]*>|</body>(.|\n)*$`, '')
          .replace(qr.i.g`<p[^>]+>`, '<p>')
          .replace(qr.i.g`<span[^>]*>`, '')
          .replace(qr.i.g`</span>`, '')
          .replace(qr.i.g`<p>(.*)</p>\n`, '$1\n').trim()
          .replace(qr.i.g`<p><br /></p>$`, ''))
      }
      let merge
      if (mergemeta) {
        const options = {
          method: mergemeta.method,
          archiveAction: mergemeta.archiveAction,          
          buildMergedArchive: mergemeta.buildMergedArchive,
          useGameLoadOrder: mergemeta.useGameLoadOrder,
          handleFaceData: mergemeta.handleFaceData,
          handleVoiceData: mergemeta.handleVoiceData,
          handleBillboards: mergemeta.handleBillboards,
          handleStringFiles: mergemeta.handleStringFiles,
          handleTranslations: mergemeta.handleTranslations,
          handleIniFiles: mergemeta.handleIniFiles,
          handleDialogViews: mergemeta.handleDialogViews,
          copyGeneralAssets: mergemeta.copyGeneralAssets
        }
        const plugins = {}
        for (let plugin of mergemeta.plugins) {
          plugins[plugin.filename] = plugin
        }
        const src = []
        for (let load of mergemeta.loadOrder) {
          if (!plugins[load]) continue
          src.push(plugins[load])
        }
        merge = {num: ++merges, options, src}
      }
      mods[mod] = { order, name: mod, id, url, comments, notes, esps, merge }
      for (let esp of esps) {
        espindex[esp] = mod
      }
    }
  }
  for (let modname of Object.keys(mods)) {
    const mod = mods[modname]
    if (!mod.merge) continue
    for (let esp of mod.merge.src) {
      const espmodname = espindex[esp.filename]
      if (!espmodname) continue
      const espmod = mods[espmodname]
      if (espmod.inMerge) continue
      espmod.inMerge = modname
//      console.log(modname, '->', espmod.name, '<-', esp.filename)
    }
  }
// mods/Vokrinator Plus Merged/merge - Vokrinator Plus Merged/merge.json
// loadOrder
// plugins
// route
//      console.log(meta)
  console.log(`
<!doctype html>
<html>
<head>
<style>
a {
  text-decoration: none;
}
.category {
  font-size: 20pt;
  font-weight: bold;
}
body {
  margin: .5in;
}
ul {
  padding-left: 1em;
}
${mergeColors.map((_,ii) => `.inmerge${ii} { background: ${_} }\n.merge${ii} { background: #333; color: ${_}; }`).join('\n')}
</style>
</head>
<body>
<div>
<b>Legend:</b><br/>
<ul>
<li><b>Bold</b> mods have plugins (esp, esm, esl files)
<li><i>italic</i> mods are merges
<li>&nbsp; &nbsp; indented mods are members of merges
<li>Unannotated mods contain no plugins (only scripts, meshes, textures, configs, etc)
</ul>
</div>
<b>The modlist:</b><br/>
<ol start="0">
`)
  for (let modname of Object.keys(mods).sort((a,b) => mods[a].order - mods[b].order)) {
    const mod = mods[modname]
    if (mod.isCategory) {
      process.stdout.write(`<li class="category">${mod.name}</li>`)
    } else {
      if (mod.inMerge) {
        process.stdout.write(`<li class="inmerge${mods[mod.inMerge].merge.num}">`)
        process.stdout.write(`&nbsp; &nbsp;`)
      } else if (mod.merge) {
        process.stdout.write(`<li class="merge${mod.merge.num}">`)
      } else {
        process.stdout.write('<li>')
      }
      if (mod.url) {
        process.stdout.write(`<a href="${mod.url}">`)
      }
      if (mod.merge) {
        process.stdout.write(`<i>${modname}</i>`)
      } else if (mod.esps.length) {
        process.stdout.write(`<b>${modname}</b>`)
      } else {
        process.stdout.write(`${modname}`)
      }
      if (mod.url) {
        process.stdout.write(`</a>`)
      }
      if (mod.comments) {
        process.stdout.write(`: ${mod.comments}`)
      }
      if (mod.notes) {
        process.stdout.write(`\n${mod.notes}`)
      }
      process.stdout.write('</li>\n')
    }
  }
  console.log('</ol></body></html>')
}
