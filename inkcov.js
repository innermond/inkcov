let PDFJS_NEEDED = true;

const img = document.getElementById("output");
img.addEventListener("load", function () {
  var c = document.getElementById("myCanvas");
  c.width = img.width;
  c.height = img.height;
  var ctx = c.getContext("2d");
  ctx.scale(img.width / img.naturalWidth, img.height / img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  var imgData = ctx.getImageData(0, 0, c.width, c.height);
  var cent = colors_percentage(imgData.data);
  console.log(cent);
});

const loading_sign = document.getElementById("loading");

const file_img = document.getElementById("file");
file_img.addEventListener("change", loadFile);

async function loadFile(event) {
  console.log("loading...", img.complete, img.width, img.height);
	loading_sign.style.display='flex';
	loading_sign.style.width=img.width+'px';
	loading_sign.style.height=img.height+'px';
	console.log(img.complete, img.x, img.y);
	loading_sign.style.left=img.x+'px';
	loading_sign.style.top=img.y+'px';
	loading_sign.firstElementChild.classList.add('animating');

	let bincontent;
  try {
    const typ = event.target.files[0].type;
    if (typ === "application/pdf") {
      if (PDFJS_NEEDED) {
        const res = await load_pdfjs();
        if (res instanceof Error) {
          console.log(res);
          return;
        }
        PDFJS_NEEDED = false;
      }
      const res = await convert_pdf_jpg(event.target.files[0]);
      await res.promise;
      var c = document.getElementById("myCanvas");
      bincontent = c.toDataURL();
		} else {
			bincontent = URL.createObjectURL(event.target.files[0]);
		}
  } catch (e) {
    console.log(e);
  } finally {
		img.src = bincontent;
		loading_sign.style.display='none';
		loading_sign.firstElementChild.classList.remove('animating');
		loading_sign.style.width=img.style.width;
		loading_sign.style.height=img.style.height;
    console.log("stop loading!");
  }
}

function load_pdfjs() {
  return new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.onload = resolve;
    s1.onerror = reject;
    s1.src = "/pdf/pdf.js";

    const s2 = document.createElement("script");
    s2.onload = resolve;
    s2.onerror = reject;
    s2.src = "/pdf/pdf.worker.js";

    document.body.appendChild(s1);
    document.body.appendChild(s2);
  });
}

async function convert_pdf_jpg(file) {
  try {
    const get_pdf_content = new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = function () {
        resolve(new Uint8Array(r.result));
      };
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });

    const cnt = await get_pdf_content;

    const doc = await pdfjsLib.getDocument(cnt).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 200 / viewport.width;
    const sw = page.getViewport({ scale: scale });
    const c = document.getElementById("myCanvas");
    c.width = sw.width;
    c.height = sw.height;
    var ctx = c.getContext("2d");
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    ctx.scale(scale, scale);

    return await page.render(renderContext);
  } catch (e) {
    console.log(e);
  }
}

function cycle_colors(d, bkg) {
  var cent = [0, 0, 0, 0];
  var val;
  var i;
  var a;
  var l = 0;
  for (i = 0; i < d.length; i += 4) {
    a = d[i + 3];
    a = clamp(a, 0, 255, 0, 1);
    val = rgba_bkg(d[i], d[i + 1], d[i + 2], a, bkg, bkg, bkg);
    // cmyk is suspect
    val = rgb_cmyk(val[0], val[1], val[2]);

    cent[0] += val[0];
    cent[1] += val[1];
    cent[2] += val[2];
    cent[3] += val[3];

    l++;
  }
  return cent.map((x) => x / l);
}

function colors_percentage(src) {
  var cent = cycle_colors(src, 255);
  var k = 1; // + cent[3]/1.74;// blind empiric number to catch few ghostscript estimations that I have made
  cent = cent.reduce((acc, x) => (acc += x), 0) * 100;
  cent = round(cent * k, 2);
  console.log(cent);
}

function round(value, decimals) {
  return Number(Math.round(value + "e" + decimals) + "e-" + decimals);
}

function clamp(me, in_min, in_max, out_min, out_max) {
  return ((me - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}

function rgb_cmyk(r, g, b) {
  var computedC = 0;
  var computedM = 0;
  var computedY = 0;
  var computedK = 0;

  if (r == 0 && g == 0 && b == 0) {
    return [0, 0, 0, 1];
  }

  computedC = 1 - r / 255;
  computedM = 1 - g / 255;
  computedY = 1 - b / 255;

  var minCMY = Math.min(computedC, Math.min(computedM, computedY));
  // push cmy to black
  computedC = (computedC - minCMY) / (1 - minCMY);
  computedM = (computedM - minCMY) / (1 - minCMY);
  computedY = (computedY - minCMY) / (1 - minCMY);
  computedK = minCMY;

  // push black to cmy - convert cmyk to cmy
  var blackC = computedC * (1 - computedK) + computedK;
  var blackM = computedM * (1 - computedK) + computedK;
  var blackY = computedY * (1 - computedK) + computedK;

  var pureK =
    computedK -
    (blackC - computedC + (blackM - computedM) + (blackY - computedY));
  pureK = Math.max(0, pureK);
  return [blackC, blackM, blackY, pureK];
}

function rgba_bkg(r, g, b, a, r2, g2, b2) {
  var r3 = Math.round((1 - a) * r2 + a * r);
  var g3 = Math.round((1 - a) * g2 + a * g);
  var b3 = Math.round((1 - a) * b2 + a * b);
  return [r3, g3, b3];
}
