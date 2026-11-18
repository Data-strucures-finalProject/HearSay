// Read-only intercepted sessions for visual review; no real account requests.
export async function auditProtectedThemes(page, audit, origin = 'http://host.docker.internal:8080') {
  const profile = {_id:'000000000000000000000001', firstname:'Visual', lastname:'Reviewer', email:'visual-review@example.invalid', loginEmails:['visual-review@example.invalid','google-visual@example.invalid'], accounts:[{kind:'Local'},{kind:'Google'}], googleProfile:{firstname:'Google',lastname:'Reviewer',email:'google-visual@example.invalid'}};
  const routeHandler = async route => {
    if(route.request().method() !== 'GET') return route.fulfill({status:405,contentType:'application/json',body:'{"ok":false,"error":"visual_review_is_read_only"}'});
    const pathname = '/api/' + route.request().url().split('/api/')[1].split('?')[0];
    let body={ok:true,items:[],nextOffset:null};
    if(pathname==='/api/me') body={authenticated:true,user:{oid:profile._id,name:'Visual Reviewer',email:profile.email,role:'admin'}};
    if(pathname==='/api/profile') body={ok:true,profile};
    if(pathname==='/api/admin/overview') body={ok:true,counts:{users:3,reviews:5,artists:2,albums:3,songs:4}};
    if(pathname==='/api/admin/insights/4') body={ok:true,items:[{username:'Visual Reviewer',userId:profile._id,reviewId:'000000000000000000000002',reviewedItemType:'album',ratingStars:4.5,relationshipStatus:'matched'}],total:1,offset:0,nextOffset:null,chart:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  };
  await page.route('**/api/**',routeHandler);
  try {
    const reports=[];
    for(const theme of ['light','dark']) for(const width of [390,1440]) reports.push(await audit(page,{
      origin,theme,width,paths:['/profile','/my-reviews','/admin'],
      afterNavigation:async (page,path) => {
        if(path==='/profile'){
          await page.getByRole('button',{name:'Use Google profile details',exact:true}).click();
          await page.getByRole('button',{name:'Edit Profile',exact:true}).click();
          await page.waitForTimeout(300);
        }
      }
    }));
    return reports;
  } finally {await page.unroute('**/api/**',routeHandler);}
}
