// Reusable in Playwright MCP: pass this function's source to browser_run_code_unsafe.
// Reads rendered DOM only; never signs in, submits forms or changes account records.
export async function auditTheme(page, options = {}) {
  const origin = options.origin || 'http://host.docker.internal:8080';
  const theme = options.theme || 'light';
  const width = options.width || 1440;
  const paths = options.paths || ['/', '/auth', '/recent-reviews', '/random', '/search?q=radiohead', '/discover?view=2', '/discover?view=5', '/discover?view=6', '/discover?view=8', '/discover?view=9', '/discover?view=10', '/community?view=1', '/community?view=3', '/community?view=7'];
  await page.setViewportSize({width, height: 1000});
  await page.goto(origin + '/discover');
  await page.evaluate(value => localStorage.setItem('theme', value), theme);
  // Deliberately use the opposite OS preference: the saved user choice must win.
  await page.emulateMedia({colorScheme: theme === 'light' ? 'dark' : 'light'});
  const results = [];
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    for (const route of paths) {
      await page.goto(origin + route, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('main h1, main h2, main [role="alert"]') || /error|unable|not found|failed/i.test(document.querySelector('main')?.textContent || ''), null, {timeout:8000}).catch(() => {});
      await page.waitForTimeout(options.delay || 300);
      if (options.afterNavigation) await options.afterNavigation(page, route);
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', {willReadFrequently:true});
        const rgba = color => {
          context.clearRect(0,0,1,1); context.fillStyle = color; context.fillRect(0,0,1,1);
          return [...context.getImageData(0,0,1,1).data].map((v,i) => i === 3 ? v/255 : v);
        };
        const composite = (fg,bg) => fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
        const luminance = rgb => rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const background = node => {
          const layers=[]; for(let e=node;e;e=e.parentElement) layers.unshift(rgba(getComputedStyle(e).backgroundColor));
          return layers.reduce((color,layer)=>composite(layer,color),[255,255,255]);
        };
        const failures=[];
        let checked=0;
        for(const node of document.querySelectorAll('main *, header *, .insights-panel *')) {
          if (!(node instanceof HTMLElement) || ['OPTION','SCRIPT','STYLE'].includes(node.tagName)) continue;
          const style=getComputedStyle(node), rect=node.getBoundingClientRect();
          if(!rect.width || !rect.height || style.visibility==='hidden' || node.closest('[disabled],[aria-hidden=true]') || Number(style.opacity)<1) continue;
          const ownText=[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
          if(!ownText && !['INPUT','TEXTAREA'].includes(node.tagName)) continue;
          if(node.tagName==='INPUT' && ['checkbox','radio','hidden'].includes(node.type)) continue;
          const bg=background(node), fg=composite(rgba(style.color),bg);
          const a=luminance(fg), b=luminance(bg), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700);
          checked++;
          if(ratio+.02<(large?3:4.5)) failures.push({tag:node.tagName,text:ownText.slice(0,50)||node.getAttribute('aria-label')||node.type,ratio:Math.round(ratio*100)/100,color:style.color,background:bg.map(Math.round),classes:node.className});
        }
        return {path:location.pathname+location.search, theme:localStorage.getItem('theme'), dark:document.documentElement.classList.contains('dark'), bodyBackground:getComputedStyle(document.body).backgroundColor, headers:document.querySelectorAll('header').length, mainCount:document.querySelectorAll('main').length, overflow:document.documentElement.scrollWidth>innerWidth, checked, contrastFailures:failures, headings:[...document.querySelectorAll('main h1, main h2')].slice(0,3).map(e=>e.textContent)};
      });
      results.push(result);
    }
    return {theme,width,errors,results};
  } finally { page.off('pageerror',onError); }
}
