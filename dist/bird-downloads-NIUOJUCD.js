import{a as S,b as A,c as L,d as E,e as I,f as T}from"./chunk-QZQGSM2W.js";import{n as v}from"./chunk-N7TCWZOE.js";var P=new TextEncoder,R=Uint32Array.from({length:256},(i,t)=>{for(let o=0;o<8;o++)t=t>>>1^(t&1?3988292384:0);return t>>>0});function j(i){let t=4294967295;for(let o of i)t=t>>>8^R[(t^o)&255];return(t^4294967295)>>>0}async function D(i){let t=[],o=[],a=new Set,c=0,r=0;for(let{name:l,blob:u}of i){if(!l||/[\\\x00]/.test(l)||l.startsWith("/")||l.split("/").some(w=>w==="..")||a.has(l))throw new Error("The download contains an invalid or duplicate filename.");a.add(l);let e=P.encode(l),b=new Uint8Array(await u.arrayBuffer()),f=j(b),m=new Uint8Array(30+e.length),d=new DataView(m.buffer);d.setUint32(0,67324752,!0),d.setUint16(4,20,!0),d.setUint16(6,2048,!0),d.setUint16(12,33,!0),d.setUint32(14,f,!0),d.setUint32(18,b.length,!0),d.setUint32(22,b.length,!0),d.setUint16(26,e.length,!0),m.set(e,30),t.push(m,b);let h=new Uint8Array(46+e.length),n=new DataView(h.buffer);n.setUint32(0,33639248,!0),n.setUint16(4,20,!0),n.setUint16(6,20,!0),n.setUint16(8,2048,!0),n.setUint16(14,33,!0),n.setUint32(16,f,!0),n.setUint32(20,b.length,!0),n.setUint32(24,b.length,!0),n.setUint16(28,e.length,!0),n.setUint32(42,c,!0),h.set(e,46),o.push(h),r+=h.length,c+=m.length+b.length}let p=new Uint8Array(22),s=new DataView(p.buffer);return s.setUint32(0,101010256,!0),s.setUint16(8,i.length,!0),s.setUint16(10,i.length,!0),s.setUint32(12,r,!0),s.setUint32(16,c,!0),new Blob([...t,...o,p],{type:"application/zip"})}var $={png:{label:"PNG",mime:"image/png",note:"Transparent \xB7 easy to use"},jpeg:{label:"JPEG",mime:"image/jpeg",note:"White background \xB7 print & share"},webp:{label:"WebP",mime:"image/webp",note:"Transparent \xB7 compact file"},svg:{label:"SVG",mime:"image/svg+xml",note:"Embedded image \xB7 design apps"}};function C(i,t,o,a){return o==="library"?[...t]:(o==="clock"?[...new Set(i.slices.map(r=>r.bird))]:[a]).map(r=>{let p=t.find(s=>s.id===r);if(!p)throw new Error("This bird is no longer available. Reopen the download panel.");return p})}function q(i,t,o,a){return`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${o}" height="${a}" viewBox="0 0 ${o} ${a}" role="img" aria-labelledby="title description">
  <title id="title">${v(i.name)}</title>
  <desc id="description">${v(i.scientificName)}. Original raster illustration embedded at its native resolution; not vector paths.</desc>
  <image width="${o}" height="${a}" href="${v(t)}"/>
</svg>`}async function H(i,t){let o=$[t];if(!o)throw new Error("Choose a supported image format.");let a=await I(i.asset),c=await L(a),r=c.naturalWidth,p=c.naturalHeight,s;if(t==="svg"){let u=a;if(!a.startsWith("data:image/png;")){let e=document.createElement("canvas");e.width=r,e.height=p,e.getContext("2d").drawImage(c,0,0),u=await E(await T(e,"image/png"))}s=new Blob([q(i,u,r,p)],{type:o.mime})}else if(a.startsWith(`data:${o.mime};`))s=await(await fetch(a)).blob();else{let u=document.createElement("canvas");u.width=r,u.height=p;let e=u.getContext("2d");if(!e)throw new Error("Image export is unavailable in this browser.");t==="jpeg"&&(e.fillStyle="#ffffff",e.fillRect(0,0,r,p)),e.drawImage(c,0,0),s=await T(u,o.mime)}let l=S(i.name)+(i.id.startsWith("custom-")?`-${i.id}`:"");return{blob:s,name:`${l}.${t==="jpeg"?"jpg":t}`,width:r,height:p}}async function B({birds:i,config:t,scope:o,selectedId:a,format:c,signal:r,onProgress:p=()=>{}}){let s=C(t,i,o,a),l=[],u=[];for(let[f,m]of s.entries()){r?.throwIfAborted(),p(`Preparing ${f+1} of ${s.length}: ${m.name}\u2026`);let d=await H(m,c);if(r?.throwIfAborted(),o==="single")return d;l.push({name:`birds/${d.name}`,blob:d.blob}),u.push({id:m.id,name:m.name,scientificName:m.scientificName,file:`birds/${d.name}`,width:d.width,height:d.height,hours:t.slices.flatMap((h,n)=>h.bird===m.id?[n+1]:[])})}l.push({name:"birds.json",blob:new Blob([JSON.stringify({design:t.name,format:c,birds:u},null,2)],{type:"application/json"})}),l.push({name:"README.txt",blob:new Blob([`WOODLAND HOURS \u2014 BIRD ILLUSTRATIONS

`,`${s.length} illustrations in ${$[c].label} format, at their original stored dimensions.
`,`Bird artwork only: clock placement, wood, rotation, and flipping are not applied.
`,`PNG and WebP preserve existing transparency. JPEG uses a white background.
`,`SVG files embed the raster illustration; they are not vector paths or cutting templates.
`,`Bundled birds are AI-generated illustrations, not authoritative taxonomic plates.
`,`Uploaded artwork is the stored, resized copy (at most 512 px). Use images you have permission to share.

`,`birds.json lists filenames, dimensions, species, and assigned clock hours.
`,`This bundle contains artwork. Export a design configuration separately to reopen the clock.
`],{type:"text/plain"})}),p("Packing your bird files\u2026");let e=await D(l);r?.throwIfAborted();let b=o==="library"?"woodland-hours-library":`${S(t.name)}-birds`;return{blob:e,name:`${b}-${c}.zip`}}function _({config:i,birds:t,selectedId:o,scope:a="single",showModal:c,modalHeader:r,toast:p}){let s=structuredClone(i),l=new AbortController;c("bird-downloads",`${r("THE ILLUSTRATION COLLECTION","A little bird to take with you.")}
    <div class="modal-body">
      <form id="bird-download-form">
        <fieldset class="download-fields">
          <legend class="sr-only">Bird download options</legend>
          <div class="download-layout">
            <div class="download-preview-column">
              <div class="download-artwork" id="download-preview"></div>
              <p class="download-caption" id="download-caption"></p>
              <p class="download-dimensions" id="download-dimensions">Original image dimensions</p>
            </div>
            <div class="download-settings">
              <label class="field-label" for="download-scope">WHAT TO TAKE</label>
              <select class="text-field" id="download-scope" name="scope">
                <option value="single" ${a==="single"?"selected":""}>One bird</option>
                <option value="clock" ${a==="clock"?"selected":""}>Birds on this clock \xB7 ZIP</option>
                <option value="library" ${a==="library"?"selected":""}>Entire bird library \xB7 ZIP</option>
              </select>
              <label class="select-field" id="download-bird-label">Choose a bird
                <select id="download-bird" name="bird">${t.map(n=>`<option value="${v(n.id)}" ${n.id===o?"selected":""}>${v(n.name)}</option>`).join("")}</select>
              </label>
              <fieldset class="format-fieldset">
                <legend class="field-label">CHOOSE A FORMAT</legend>
                <div class="format-grid">${Object.entries($).map(([n,w])=>`<label class="format-option">
                  <input type="radio" name="format" value="${n}" ${n==="png"?"checked":""}>
                  <span><strong>${w.label}</strong><small>${w.note}</small></span>
                </label>`).join("")}</div>
              </fieldset>
              <p class="download-format-note" id="download-format-note"></p>
            </div>
          </div>
          <div class="download-footer">
            <p id="download-summary"></p>
            <button class="button primary" id="download-birds-submit" type="submit">Download PNG <span aria-hidden="true">\u2193</span></button>
          </div>
        </fieldset>
        <p class="download-progress" id="download-progress" role="status" aria-live="polite"></p>
      </form>
      <p class="modal-note">Original illustrations, without clock placement or wood. ZIP files include a bird index with the hours in your design. Your uploaded birds are included as their saved copies.</p>
    </div>`);let u=document.querySelector("#modal"),e=document.querySelector("#bird-download-form"),b=e.querySelector(".download-fields"),f=e.querySelector("#download-progress"),m=e.querySelector("#download-birds-submit"),d=()=>({scope:e.elements.scope.value,selectedId:e.elements.bird.value,format:e.elements.format.value}),h=()=>{let n=d(),w=C(s,t,n.scope,n.selectedId),g=n.scope==="single",x=$[n.format],U=e.querySelector("#download-preview");e.querySelector("#download-bird-label").hidden=!g,U.classList.toggle("flock",!g),U.classList.toggle("white-background",n.format==="jpeg"),U.innerHTML=w.slice(0,9).map(y=>`<img src="${v(y.asset)}" alt="${v(y.name)}">`).join(""),e.querySelector("#download-caption").textContent=g?w[0].name:`${w.length} birds, one little collection.`;let O=e.querySelector("#download-dimensions");if(O.textContent="Original image dimensions",g){let y=U.querySelector("img"),k=()=>{y.isConnected&&(O.textContent=`${y.naturalWidth} \xD7 ${y.naturalHeight} px \xB7 original size`)};y.complete&&y.naturalWidth?k():y.addEventListener("load",k,{once:!0})}e.querySelector("#download-format-note").textContent=n.format==="svg"?"A self-contained SVG with the original image embedded. This preserves the illustration; it does not create vector paths or a cutting template.":n.format==="jpeg"?"A high-quality image on white. JPEG does not support transparency.":"Keeps the illustration\u2019s existing transparency at its original resolution. No upscaling or cropping.",e.querySelector("#download-summary").textContent=g?`1 illustration \xB7 ${x.label}`:`${w.length} illustrations \xB7 ${x.label} in a ZIP file`,m.innerHTML=`Download ${g?x.label:"ZIP"} <span aria-hidden="true">\u2193</span>`,f.textContent="",f.classList.remove("error")};e.addEventListener("change",h),u.addEventListener("close",()=>l.abort(),{once:!0}),e.addEventListener("submit",async n=>{if(n.preventDefault(),b.disabled)return;b.disabled=!0,e.setAttribute("aria-busy","true"),f.classList.remove("error");let w=m.innerHTML;m.textContent="Preparing files\u2026";try{let g=await B({birds:t,config:s,...d(),signal:l.signal,onProgress:x=>{f.textContent=x}});l.signal.throwIfAborted(),A(g.blob,g.name),f.textContent="Your download is ready. Enjoy your little piece of the woods.",p("Bird files ready. Check your downloads.")}catch(g){g.name!=="AbortError"&&(f.textContent=g.message||"These files could not be prepared. Please try again.",f.classList.add("error"))}finally{b.disabled=!1,e.removeAttribute("aria-busy"),m.innerHTML=w}}),h()}export{_ as openBirdDownloads};
