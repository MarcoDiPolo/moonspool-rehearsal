// Run with Playwright available to Node; set CHROMIUM_PATH for an existing browser.
const {chromium}=require("playwright"), assert=require("node:assert/strict");
const http=require("node:http"), fs=require("node:fs"), path=require("node:path");
const root=path.resolve(__dirname,"..");
async function main(){
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const file=path.resolve(root,"."+(pathname==="/"?"/index.html":pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader("Content-Type",({".mjs":"text/javascript",".css":"text/css",".html":"text/html"})[path.extname(file)]||"text/plain");fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined});
    const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:"+server.address().port);
    const status=page.locator("#status"),cue=page.locator("#cue");
    await page.locator("table").waitFor();
    if(process.env.SCREENSHOT_FILE){
      await page.setViewportSize({width:1000,height:780});
      await page.locator("section.stand").screenshot({path:process.env.SCREENSHOT_FILE});
    }
    assert.equal(await page.locator("td").count(),80);
    assert.equal(await page.locator("td.active").count(),11);
    await page.locator("#roll").fill("unrelated");
    await page.getByRole("button",{name:"Load roll"}).click();
    assert.match(await page.getByRole("alert").innerText(),/24 characters/);
    await page.locator("#roll").fill("https://marcodipolo.github.io/moonspool-cabinet/#ASQBAAIABAAFAAgACQAQABEA");
    await page.getByRole("button",{name:"Load roll"}).click();
    assert.equal(await page.getByRole("alert").innerText(),"");
    await page.locator("#from").selectOption("7");await page.locator("#to").selectOption("7");
    await page.locator("#loops").selectOption("2");await page.locator("#bpm").fill("60");
    await page.locator("#sound").uncheck();await page.locator("#count").uncheck();
    await page.getByRole("button",{name:"Start rehearsal"}).click();
    await cue.filter({hasText:"Step 7 | A3 + D4"}).waitFor();
    await status.filter({hasText:"Rehearsal complete"}).waitFor();
    await page.locator("#count").check();await page.locator("#sound").check();
    await page.getByRole("button",{name:"Start rehearsal"}).click();
    await status.filter({hasText:"Count-in"}).waitFor();await cue.filter({hasText:"Beat 1"}).waitFor();
    await page.getByRole("button",{name:"Stop",exact:true}).click();
    assert.equal(await status.innerText(),"Stopped");assert.equal(await page.locator("td.current").count(),0);
    await page.setViewportSize({width:355,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const clean=await page.evaluate(async()=>{
      const host=document.createElement("div");document.body.append(host);
      const {mount}=await import("./ui/stand.mjs");const unmount=mount(host);
      const shadow=host.firstChild.shadowRoot;shadow.querySelector("#sound").checked=false;
      shadow.querySelector("#play").click();unmount();const count=host.childElementCount;host.remove();return count;
    });
    assert.equal(clean,0);assert.deepEqual(errors,[]);console.log("Browser PASS: import, score, muted phrase, audible count-in, stop, narrow display, unmount.");
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
