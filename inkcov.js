let PDFJS_NEEDED = true;
let UTIF_NEEDED = true;
const img_wh = document.getElementById("image_dimensions");
const img_cov = document.getElementById("image_coverage");
const img = document.getElementById("output");
img.addEventListener("load", function () {
  var c = document.getElementById("draw_image");
  c.width = img.width;
  c.height = img.height;
  var ctx = c.getContext("2d");
  ctx.scale(img.width / img.naturalWidth, img.height / img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  var imgData = ctx.getImageData(0, 0, c.width, c.height);
  var cent = colors_percentage(imgData.data);
	let mmw = unit_conv(img.naturalWidth+'px', 'mm');
	let mmh = unit_conv(img.naturalHeight+'px', 'mm');
	[mmw, mmh] = [mmw, mmh].map(x=>round(x,2));
	console.log('mm', mmw, mmh);
	img_wh.textContent = `${mmw}x${mmh}mm`;
	img_cov.textContent = `${round(cent, 2)}%`;
	const n_1mm = 4.5595;
	const e_1mm = 0.00000364;
	const nn = Math.ceil(mmw*mmh*n_1mm*cent/100, 0);
	const p = round(mmw*mmh*e_1mm*cent/100, 5);
	console.log('coverage %', cent, 'price', p, 'picoliters', nn);
});

const loading_sign = document.getElementById("loading");

const file_img = document.getElementById("file");
file_img.addEventListener("change", loadFile);

async function loadFile(event) {
	loading_sign.style.display='flex';
	loading_sign.style.width=img.width+'px';
	loading_sign.style.height=img.height+'px';
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
      var c = document.getElementById("draw_image");
      bincontent = c.toDataURL();
		} else if (/^image\/tiff?$/.test(typ)) {
			if (UTIF_NEEDED) {
        const res = await load_utif();
        if (res instanceof Error) {
          console.log(res);
          return;
        }
        UTIF_NEEDED = false;
			}
      bincontent = await convert_tif_jpg(event.target.files[0]);
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
  }
}

function unit_conv(unit_src, u_dst) {
  if (unit_src.length === 0) return 0;
  const u_src = unit_src.substr(-2);
  if (u_src === u_dst) return parseFloat(unit_src);

  const div = document.createElement('div');
  const unit_val = 10;
  // assume unit is epressed as last 2 chars
  div.style.width = unit_val + u_src;
  document.body.appendChild(div);
  let unit_px;
  if (u_src !== 'px') {
    const ss = window.getComputedStyle(div);
    unit_px = parseFloat(ss.width);
  } else {
    unit_px = unit_val;
  }
  div.style.width = unit_val + u_dst;
  let k = window.getComputedStyle(div).width;
  k = unit_px / parseFloat(k);

  div.remove();

  return parseFloat(unit_src) * k;
}

function load_script(...ff) {
	const pp = [];
	ff.forEach(f => {
		const p = new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.onload = resolve;
			s.onerror = reject;
			s.src = f;
			document.body.appendChild(s);
		});
		pp.push(p);
	});
	return Promise.all(pp);
}

function load_pdfjs() {
	return load_script('/pdf/pdf.js', '/pdf/pdf.worker.js');
}

function load_utif() {
	return load_script('/pako.js', '/UTIF.js');
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
		// pdfjs renders at 72dpi
		// currently browsers renders at 96dpi
		const dpi = 96*window.devicePixelRatio;
		// we scale between pdfjs and browser
    const scale = dpi/72;
    const sw = page.getViewport({ scale: scale });
		console.log('w pdf', sw.width);
    const c = document.getElementById("draw_image");
    c.width = sw.width;
    c.height = sw.height;
    var ctx = c.getContext("2d");
    const renderContext = {
      canvasContext: ctx,
      viewport: sw,
    };
    ctx.scale(scale, scale);

    return await page.render(renderContext);
  } catch (e) {
    console.log(e);
  }
}

async function convert_tif_jpg(file) {
  try {
    const get_tif_content = new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = function () {
        resolve(new Uint8Array(r.result));
      };
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });

    const buff = await get_tif_content;
		var ifds = UTIF.decode(buff);
		var vsns = ifds, ma=0, page=vsns[0];  if(ifds[0].subIFD) vsns = vsns.concat(ifds[0].subIFD);
		for(var i=0; i<vsns.length; i++) {
			var img = vsns[i];
			if(img["t258"]==null || img["t258"].length<3) continue;
			var ar = img["t256"]*img["t257"];
			if(ar>ma) {  ma=ar;  page=img;  }
		}
		UTIF.decodeImage(buff, page, ifds);
		var rgba = UTIF.toRGBA8(page), w=page.width, h=page.height;
		var cnv = document.getElementById("draw_image");  cnv.width=w;  cnv.height=h;
		var ctx = cnv.getContext("2d");
		// currently browsers renders at 96dpi
		const dpi = 96*window.devicePixelRatio;
		// we scale between pdfjs and browser
    const scale = dpi/72;
		ctx.scale(scale, scale);
		var imgd = new ImageData(new Uint8ClampedArray(rgba.buffer),w,h);
		ctx.putImageData(imgd,0,0);
		return cnv.toDataURL();
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
  cent = cent.reduce((acc, x) => (acc += x), 0) * 100;
	return cent;
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
