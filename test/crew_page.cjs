// The throwaway dashboard login travels only in memory on stdin.
const {chromium}=require("playwright"), assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"),root=path.resolve(__dirname,"..");
async function main(){
  let input="";for await(const chunk of process.stdin)input+=chunk;
  const {port,url}=JSON.parse(input), base=new URL(url).origin;
  assert.equal(Number(new URL(url).port),port);
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(30000);
    // Prevent a dashboard visualization from reaching external sites during this fixture.
    await page.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const login=await page.request.get(url);
    assert.equal(login.status(),200,"Gateway sign-in link rejected.");
    async function api(route,body){
      const opts={headers:{Origin:base},timeout:45000};
      const result=body===undefined?await page.request.get(base+route,opts):await page.request.post(base+route,{...opts,data:body});
      const data=await result.json();
      assert.ok(result.ok(),route+" HTTP "+result.status()+" "+(data.code||""));
      return data;
    }
    await api("/api/apps/install",{source:root});
    // Same app-specific consent as the Store prompt, in the throwaway profile.
    await api("/api/security/trusted-apps/moonspool-rehearsal",{});
    await api("/api/apps/moonspool-rehearsal/enable",{});
    const record=await api("/api/apps/moonspool-rehearsal");
    assert.ok(record.enabled);assert.equal(record.manifest.ui.entry,"crew.mjs");
    for(const file of ["crew.mjs","stand.mjs","transport.mjs","roll.mjs","stand.css"]){
      const asset=await page.request.get(base+"/apps/moonspool-rehearsal/ui/"+file);
      assert.equal(asset.status(),200);assert.deepEqual(await asset.body(),fs.readFileSync(path.join(root,"ui",file)));
    }
    console.log("Official gateway installed and enabled the app; all five served assets matched the checkout.");
    await page.goto(base+"/apps/moonspool-rehearsal",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Moonspool Rehearsal",exact:true}).last().waitFor();
    const button=page.getByRole("button",{name:"Start rehearsal"});await button.waitFor();
    assert.equal(await page.locator("#roll").inputValue(),"ASQBAAIABAAFAAgACQAQABEA");
    assert.equal(await page.locator("td.active").count(),11);
    await page.locator("#sound").uncheck();await page.locator("#count").uncheck();
    await page.locator("#from").selectOption("7");await page.locator("#to").selectOption("7");
    await page.locator("#loops").selectOption("2");await page.locator("#bpm").fill("60");
    await button.click();await page.locator("#cue").filter({hasText:"Step 7 | A3 + D4"}).waitFor();
    await page.locator("#status").filter({hasText:"Rehearsal complete"}).waitFor();
    console.log("Official dashboard PASS: React mounted, Cabinet roll rendered, two selected chord passes completed.");
  }finally{await browser.close();}
}
main().catch(e=>{
  // Playwright can include the login URL in error details; emit only the failed condition.
  const clean=String(e.message).split("\n").filter(s=>!s.includes("http")&&!s.includes("token=")).slice(0,3).join(" ");
  console.error("Dashboard test failed: "+clean);process.exitCode=1;
});
