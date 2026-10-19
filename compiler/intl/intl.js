// String.raw: no backticks or dollar-brace sequences in here
export default String.raw`
// vars: these are global object properties
var $IntlHooks$;
var Intl = {};

const I$defProp = Object.defineProperty;
const I$getOwnDesc = Object.getOwnPropertyDescriptor;
const I$objCreate = Object.create;
const I$getProto = Object.getPrototypeOf;
const I$ownKeys = Reflect.ownKeys;
const I$REQUIRED = {};

const I$isObj = x => (typeof x === 'object' && x !== null) || typeof x === 'function';
const I$toObject = x => {
  if (x === undefined || x === null) throw new TypeError('Cannot convert undefined or null to object');
  return Object(x);
};
const I$toPrimitive = (value, hint) => {
  const ex = value[Symbol.toPrimitive];
  if (ex !== undefined && ex !== null) {
    if (typeof ex !== 'function') throw new TypeError('Symbol.toPrimitive is not callable');
    const r = ex.call(value, hint);
    if (I$isObj(r)) throw new TypeError('Cannot convert object to primitive value');
    return r;
  }
  const names = hint === 'string' ? [ 'toString', 'valueOf' ] : [ 'valueOf', 'toString' ];
  for (let i = 0; i < 2; i++) {
    const f = value[names[i]];
    if (typeof f === 'function') {
      const v = f.call(value);
      if (!I$isObj(v)) return v;
    }
  }
  throw new TypeError('Cannot convert object to primitive value');
};
const I$toStr = x => {
  if (typeof x === 'string') return x;
  if (typeof x === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  if (I$isObj(x)) return I$toStr(I$toPrimitive(x, 'string'));
  return String(x);
};
const I$toNum = x => {
  if (typeof x === 'number') return x;
  if (I$isObj(x)) x = I$toPrimitive(x, 'number');
  if (typeof x === 'symbol' || typeof x === 'bigint') throw new TypeError('Cannot convert a ' + typeof x + ' value to a number');
  return +x;
};
const I$toLength = x => {
  let n = I$toNum(x);
  if (n !== n || n <= 0) return 0;
  n = Math.floor(n);
  return n > 9007199254740991 ? 9007199254740991 : n;
};
const I$push = (list, v) => { list[list.length] = v; };
const I$indexOf = (list, v) => {
  for (let i = 0; i < list.length; i++) if (list[i] === v) return i;
  return -1;
};
const I$contains = (list, v) => I$indexOf(list, v) !== -1;
const I$join = (list, sep) => {
  let out = '';
  for (let i = 0; i < list.length; i++) out += (i ? sep : '') + list[i];
  return out;
};
const I$sortStrings = list => {
  for (let i = 1; i < list.length; i++) {
    let v = list[i], j = i - 1;
    while (j >= 0 && list[j] > v) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = v;
  }
  return list;
};
const I$sortPairs = list => {
  for (let i = 1; i < list.length; i++) {
    let v = list[i], j = i - 1;
    while (j >= 0 && list[j][0] > v[0]) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = v;
  }
  return list;
};
const I$createArray = list => {
  const a = [];
  for (let i = 0; i < list.length; i++) a[i] = list[i];
  return a;
};
// building literals and deleting absent fields is cheaper than defineProperty per field
const I$dropUndefined = o => {
  const keys = I$ownKeys(o);
  for (let i = 0; i < keys.length; i++) if (o[keys[i]] === undefined) delete o[keys[i]];
  return o;
};
const I$splitStr = (s, sep) => {
  let out = [], start = 0, c = sep.charCodeAt(0);
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === c) {
      I$push(out, s.slice(start, i));
      start = i + 1;
    }
  }
  I$push(out, s.slice(start));
  return out;
};
const I$table = (s, sep1, sep2) => {
  const o = I$objCreate(null);
  const parts = I$splitStr(s, sep1 || ',');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], j = p.indexOf(sep2 || ':');
    o[p.slice(0, j)] = p.slice(j + 1);
  }
  return o;
};
const I$lazy = fn => {
  let v;
  return () => {
    if (v === undefined) v = fn();
    return v;
  };
};
const I$memo = fn => {
  const cache = I$objCreate(null);
  return k => {
    const v = cache[k];
    return v !== undefined ? v : cache[k] = fn(k);
  };
};

const I$install = (target, src) => {
  const keys = I$ownKeys(src);
  for (let i = 0; i < keys.length; i++) {
    const d = I$getOwnDesc(src, keys[i]);
    d.enumerable = false;
    if (d.get && typeof keys[i] === 'string') I$defProp(d.get, 'name', { value: 'get ' + keys[i], configurable: true });
    if (typeof d.value === 'function' && typeof keys[i] === 'symbol' && d.value.name !== '[' + keys[i].description + ']')
      I$defProp(d.value, 'name', { value: '[' + keys[i].description + ']', configurable: true });
    I$defProp(target, keys[i], d);
  }
};
const I$setTag = (proto, tag) => {
  I$defProp(proto, Symbol.toStringTag, { value: tag, writable: false, enumerable: false, configurable: true });
};
const I$makeCtorProps = (C, len, tag) => {
  I$defProp(C, 'length', { value: len, configurable: true });
  I$defProp(C, 'prototype', { writable: false, enumerable: false, configurable: false });
  I$setTag(C.prototype, tag);
};
const I$ordinaryHasInstance = (C, O) => {
  if (!I$isObj(O)) return false;
  const P = C.prototype;
  while ((O = I$getProto(O)) !== null) if (O === P) return true;
  return false;
};
const I$internalSlots = new WeakMap();
const I$setSlots = (x, brand, o) => {
  o.brand = brand;
  I$internalSlots.set(x, o);
};
const I$slotsOf = (x, brand) => {
  const s = I$isObj(x) ? I$internalSlots.get(x) : undefined;
  return s !== undefined && s.brand === brand ? s : undefined;
};
const I$thisSlots = (x, brand) => {
  const s = I$slotsOf(x, brand);
  if (s === undefined) throw new TypeError('Receiver is not ' + brand);
  return s;
};

const I$getOptionsObject = options => {
  if (options === undefined) return I$objCreate(null);
  if (I$isObj(options)) return options;
  throw new TypeError('Options must be an object');
};
const I$coerceOptionsToObject = options => {
  if (options === undefined) return I$objCreate(null);
  return I$toObject(options);
};
const I$getOption = (options, prop, type, values, fallback) => {
  let value = options[prop];
  if (value === undefined) {
    if (fallback === I$REQUIRED) throw new RangeError(prop + ' is required');
    return fallback;
  }
  if (type === 'boolean') value = !!value;
  else value = I$toStr(value);
  if (values !== undefined && !I$contains(values, value)) throw new RangeError('Value ' + value + ' out of range for option ' + prop);
  return value;
};
const I$defaultNumberOption = (value, min, max, fallback) => {
  if (value === undefined) return fallback;
  value = I$toNum(value);
  if (value !== value || value < min || value > max) throw new RangeError('Value out of range');
  return Math.floor(value);
};
const I$getNumberOption = (options, prop, min, max, fallback) => I$defaultNumberOption(options[prop], min, max, fallback);
const I$getLocaleMatcher = options => I$getOption(options, 'localeMatcher', 'string', [ 'lookup', 'best fit' ], 'best fit');
const I$isAlphaC = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
const I$isDigitC = c => c >= 48 && c <= 57;
const I$allAlnum = s => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!I$isAlphaC(c) && !I$isDigitC(c)) return false;
  }
  return true;
};
const I$isUType = s => {
  const p = I$splitStr(s, '-');
  for (let i = 0; i < p.length; i++) if (p[i].length < 3 || p[i].length > 8 || !I$allAlnum(p[i])) return false;
  return true;
};
const I$getUTypeOption = (options, prop, bare) => {
  const value = I$getOption(options, prop, 'string', undefined, undefined);
  if (value !== undefined && !I$isUType(value)) throw new RangeError('Invalid ' + prop + (bare ? '' : ' : ' + value));
  return value;
};
const I$getBooleanOrStringOption = (options, prop, stringValues, trueValue, falsyValue, fallback) => {
  let value = options[prop];
  if (value === undefined) return fallback;
  if (value === true) return trueValue;
  if (!value) return falsyValue;
  value = I$toStr(value);
  if (value === 'true' || value === 'false') return fallback;
  if (!I$contains(stringValues, value)) throw new RangeError('Value ' + value + ' out of range for option ' + prop);
  return value;
};

const I$asciiLower = s => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 127) return null;
    out += (c >= 65 && c <= 90) ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
};
const I$asciiUpper = s => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c >= 97 && c <= 122) ? String.fromCharCode(c - 32) : s[i];
  }
  return out;
};
const I$titleCase = s => I$asciiUpper(s.slice(0, 1)) + s.slice(1);
const I$allAlpha = s => {
  for (let i = 0; i < s.length; i++) if (!I$isAlphaC(s.charCodeAt(i))) return false;
  return true;
};
const I$allDigit = s => {
  for (let i = 0; i < s.length; i++) if (!I$isDigitC(s.charCodeAt(i))) return false;
  return true;
};
const I$isLangSub = s => {
  const n = s.length;
  return ((n >= 2 && n <= 3) || (n >= 5 && n <= 8)) && I$allAlpha(s);
};
const I$isScriptSub = s => s.length === 4 && I$allAlpha(s);
const I$isRegionSub = s => (s.length === 2 && I$allAlpha(s)) || (s.length === 3 && I$allDigit(s));
const I$isVariantSub = s => {
  const n = s.length;
  return ((n >= 5 && n <= 8) || (n === 4 && I$isDigitC(s.charCodeAt(0)))) && I$allAlnum(s);
};

const I$parseLangId = (p, i) => {
  if (i >= p.length || !I$isLangSub(p[i])) return null;
  const r = { lang: p[i], script: '', region: '', variants: [], end: 0 };
  i++;
  if (i < p.length && I$isScriptSub(p[i])) r.script = p[i++];
  if (i < p.length && I$isRegionSub(p[i])) r.region = p[i++];
  while (i < p.length && I$isVariantSub(p[i])) {
    if (I$contains(r.variants, p[i])) return null;
    I$push(r.variants, p[i++]);
  }
  r.end = i;
  return r;
};

const I$parseTag = tag => {
  const s = I$asciiLower(tag);
  if (s === null || s.length === 0) return null;
  const p = I$splitStr(s, '-');
  for (let k = 0; k < p.length; k++) if (p[k].length === 0 || p[k].length > 8 || !I$allAlnum(p[k])) return null;
  const r = I$parseLangId(p, 0);
  if (!r) return null;
  let i = r.end;
  let exts = [], seen = '';
  while (i < p.length && p[i].length === 1 && p[i] !== 'x') {
    const sg = p[i++];
    if (seen.indexOf(sg) !== -1) return null;
    seen += sg;
    if (sg === 'u') {
      const attrs = [], kws = [];
      while (i < p.length && p[i].length >= 3) I$push(attrs, p[i++]);
      while (i < p.length && p[i].length === 2) {
        const key = p[i++];
        if (!I$isAlphaC(key.charCodeAt(1))) return null;
        const vals = [];
        while (i < p.length && p[i].length >= 3) I$push(vals, p[i++]);
        I$push(kws, [ key, I$join(vals, '-') ]);
      }
      if (attrs.length === 0 && kws.length === 0) return null;
      I$push(exts, { type: 'u', attrs, kws, tlang: null, value: '' });
    } else if (sg === 't') {
      let tlang = null;
      if (i < p.length && I$isLangSub(p[i])) {
        tlang = I$parseLangId(p, i);
        if (!tlang) return null;
        i = tlang.end;
      }
      const fields = [];
      while (i < p.length && p[i].length === 2 && I$isAlphaC(p[i].charCodeAt(0)) && I$isDigitC(p[i].charCodeAt(1))) {
        const tkey = p[i++];
        const vals = [];
        while (i < p.length && p[i].length >= 3) I$push(vals, p[i++]);
        if (vals.length === 0) return null;
        I$push(fields, [ tkey, I$join(vals, '-') ]);
      }
      if (!tlang && fields.length === 0) return null;
      I$push(exts, { type: 't', attrs: [], kws: fields, tlang, value: '' });
    } else {
      const vals = [];
      while (i < p.length && p[i].length >= 2) I$push(vals, p[i++]);
      if (vals.length === 0) return null;
      I$push(exts, { type: sg, attrs: [], kws: [], tlang: null, value: I$join(vals, '-') });
    }
  }
  let pu = '';
  if (i < p.length) {
    if (p[i] !== 'x' || i + 1 >= p.length) return null;
    pu = I$join(p.slice(i + 1), '-');
    i = p.length;
  }
  r.exts = exts;
  r.pu = pu;
  return r;
};

const I$aliasData = I$lazy(() => {
  const cregion = I$objCreate(null), cr = I$splitStr('172:RU;ab=GE;az=AZ;be=BY;crh=UA;gag=MD;got=UA;hy=AM;ji=UA;ka=GE;kaa=UZ;kk=KZ;ku-Yezi=GE;ky=KG;os=GE;rue=UA;sog=UZ;tg=TJ;tk=TM;tkr=AZ;tly=AZ;ttt=AZ;ug-Cyrl=KZ;uk=UA;und-Armn=AM;und-Chrs=UZ;und-Geor=GE;und-Goth=UA;und-Sogd=UZ;und-Sogo=UZ;und-Yezi=GE;uz=UZ;xco=UZ;xmf=GE|200:CZ;sk=SK|530:CW;vic=SX|532:CW;vic=SX|536:SA;akk=IQ;ckb=IQ;ku-Arab=IQ;mis=IQ;syr=IQ;und-Hatr=IQ;und-Syrc=IQ;und-Xsux=IQ|582:FM;mh=MH;pau=PW|810:RU;ab=GE;az=AZ;be=BY;crh=UA;et=EE;gag=MD;got=UA;hy=AM;ji=UA;ka=GE;kaa=UZ;kk=KZ;ku-Yezi=GE;ky=KG;lt=LT;ltg=LV;lv=LV;os=GE;rue=UA;sgs=LT;sog=UZ;tg=TJ;tk=TM;tkr=AZ;tly=AZ;ttt=AZ;ug-Cyrl=KZ;uk=UA;und-Armn=AM;und-Chrs=UZ;und-Geor=GE;und-Goth=UA;und-Sogd=UZ;und-Sogo=UZ;und-Yezi=GE;uz=UZ;vro=EE;xco=UZ;xmf=GE|890:RS;bs=BA;hr=HR;mk=MK;sl=SI|AN:CW;vic=SX|NT:SA;akk=IQ;ckb=IQ;ku-Arab=IQ;mis=IQ;syr=IQ;und-Hatr=IQ;und-Syrc=IQ;und-Xsux=IQ|PC:FM;mh=MH;pau=PW|SU:RU;ab=GE;az=AZ;be=BY;crh=UA;et=EE;gag=MD;got=UA;hy=AM;ji=UA;ka=GE;kaa=UZ;kk=KZ;ku-Yezi=GE;ky=KG;lt=LT;ltg=LV;lv=LV;os=GE;rue=UA;sgs=LT;sog=UZ;tg=TJ;tk=TM;tkr=AZ;tly=AZ;ttt=AZ;ug-Cyrl=KZ;uk=UA;und-Armn=AM;und-Chrs=UZ;und-Geor=GE;und-Goth=UA;und-Sogd=UZ;und-Sogo=UZ;und-Yezi=GE;uz=UZ;vro=EE;xco=UZ;xmf=GE', '|');
  for (let i = 0; i < cr.length; i++) {
    const parts = I$splitStr(cr[i], ';'), j = parts[0].indexOf(':');
    const m = I$objCreate(null);
    m[''] = parts[0].slice(j + 1);
    for (let k = 1; k < parts.length; k++) {
      const e = parts[k].indexOf('=');
      m[parts[k].slice(0, e)] = parts[k].slice(e + 1);
    }
    cregion[parts[0].slice(0, j)] = m;
  }
  const uni = I$objCreate(null), u = I$splitStr('ca:ethiopic-amete-alem=ethioaa;islamicc=islamic-civil|kb:yes=true|kc:yes=true|kh:yes=true|kk:yes=true|kn:yes=true|ks:primary=level1;tertiary=level3|ms:imperial=uksystem|rg:cn11=cnbj;cn12=cntj;cn13=cnhe;cn14=cnsx;cn15=cnmn;cn21=cnln;cn22=cnjl;cn23=cnhl;cn31=cnsh;cn32=cnjs;cn33=cnzj;cn34=cnah;cn35=cnfj;cn36=cnjx;cn37=cnsd;cn41=cnha;cn42=cnhb;cn43=cnhn;cn44=cngd;cn45=cngx;cn46=cnhi;cn50=cncq;cn51=cnsc;cn52=cngz;cn53=cnyn;cn54=cnxz;cn61=cnsn;cn62=cngs;cn63=cnqh;cn64=cnnx;cn65=cnxj;cz10a=cz110;cz10b=cz111;cz10c=cz112;cz10d=cz113;cz10e=cz114;cz10f=cz115;cz611=cz663;cz612=cz632;cz613=cz633;cz614=cz634;cz615=cz635;cz621=cz641;cz622=cz642;cz623=cz643;cz624=cz644;cz626=cz646;cz627=cz647;czjc=cz31;czjm=cz64;czka=cz41;czkr=cz52;czli=cz51;czmo=cz80;czol=cz71;czpa=cz53;czpl=cz32;czpr=cz10;czst=cz20;czus=cz42;czvy=cz63;czzl=cz72;fra=frges;frb=frnaq;frc=frara;frd=frbfc;fre=frbre;frf=frcvl;frg=frges;frh=frcor;fri=frbfc;frj=fridf;frk=frocc;frl=frnaq;frm=frges;frn=frocc;fro=frhdf;frp=frnor;frq=frnor;frr=frpdl;frs=frhdf;frt=frnaq;fru=frpac;frv=frara;laxn=laxs;lud=lucl;lug=luec;lul=luca;mrnkc=mr13;no23=no50;nzn=nzauk;nzs=nzcan;omba=ombj;omsh=omsj;plds=pl02;plkp=pl04;pllb=pl08;plld=pl10;pllu=pl06;plma=pl12;plmz=pl14;plop=pl16;plpd=pl20;plpk=pl18;plpm=pl22;plsk=pl26;plsl=pl24;plwn=pl28;plwp=pl30;plzp=pl32;tteto=tttob;ttrcm=ttmrc;ttwto=tttob;twkhq=twkhh;twtnq=twtnn;twtpq=twnwt;twtxq=twtxg|tz:aqams=nzakl;cnckg=cnsha;cnhrb=cnsha;cnkhg=cnurc;cuba=cuhav;egypt=egcai;eire=iedub;est=papty;gmt0=gmt;hongkong=hkhkg;hst=ushnl;iceland=isrey;iran=irthr;israel=jeruslm;jamaica=jmkin;japan=jptyo;libya=lytip;mst=usphx;navajo=usden;poland=plwaw;portugal=ptlis;prc=cnsha;roc=twtpe;rok=krsel;turkey=trist;uct=utc;usnavajo=usden;zulu=utc', '|');
  for (let i = 0; i < u.length; i++) {
    const j = u[i].indexOf(':');
    uni[u[i].slice(0, j)] = I$table(u[i].slice(j + 1), ';', '=');
  }
  uni.sd = uni.rg;
  return {
    lang: I$table('aam:aas,aar:aa,abk:ab,adp:dz,afr:af,aju:jrb,aka:ak,alb:sq,als:sq,amh:am,ara:ar,arb:ar,arg:an,arm:hy,asd:snz,asm:as,aue:ktz,ava:av,ave:ae,aym:ay,ayr:ay,ayx:nun,aze:az,azj:az,bak:ba,bam:bm,baq:eu,bcc:bal,bcl:bik,bel:be,ben:bn,bgm:bcg,bh:bho,bih:bho,bis:bi,bjd:drl,bod:bo,bos:bs,bre:br,bul:bg,bur:my,bxk:luy,bxr:bua,cat:ca,ccq:rki,ces:cs,cha:ch,che:ce,chi:zh,chu:cu,chv:cv,cjr:mom,cka:cmr,cld:syr,cmk:xch,cmn:zh,cor:kw,cos:co,coy:pij,cqu:quh,cre:cr,cwd:cr,cym:cy,cze:cs,dan:da,deu:de,dgo:doi,dhd:mwr,dik:din,diq:zza,dit:dif,div:dv,drh:mn,dut:nl,dzo:dz,ekk:et,ell:el,emk:man,eng:en,epo:eo,esk:ik,est:et,eus:eu,ewe:ee,fao:fo,fas:fa,fat:ak,fij:fj,fin:fi,fra:fr,fre:fr,fry:fy,fuc:ff,ful:ff,gav:dev,gaz:om,gbo:grb,geo:ka,ger:de,gfx:vaj,ggn:gvr,gla:gd,gle:ga,glg:gl,glv:gv,gno:gon,gre:el,grn:gn,gti:nyc,gug:gn,guj:gu,guv:duz,gya:gba,hat:ht,hau:ha,hdn:hai,hea:hmn,heb:he,her:hz,him:srx,hin:hi,hmo:ho,hrr:jal,hrv:hr,hun:hu,hye:hy,ibi:opa,ibo:ig,ice:is,ido:io,iii:ii,ike:iu,iku:iu,ile:ie,ilw:gal,in:id,ina:ia,ind:id,ipk:ik,isl:is,ita:it,iw:he,jav:jv,jeg:oyb,ji:yi,jpn:ja,jw:jv,kal:kl,kan:kn,kas:ks,kat:ka,kau:kr,kaz:kk,kgc:tdf,kgh:kml,khk:mn,khm:km,kik:ki,kin:rw,kir:ky,kmr:ku,knc:kr,kng:kg,knn:kok,koj:kwv,kom:kv,kon:kg,kor:ko,kpv:kv,krm:bmf,ktr:dtp,kua:kj,kur:ku,kvs:gdj,kwq:yam,kxe:tvd,kzj:dtp,kzt:dtp,lao:lo,lat:la,lav:lv,lbk:bnc,lii:raq,lim:li,lin:ln,lit:lt,llo:ngt,lmm:rmx,ltz:lb,lub:lu,lug:lg,lvs:lv,mac:mk,mah:mh,mal:ml,mao:mi,mar:mr,may:ms,meg:cir,mhr:chm,mkd:mk,mlg:mg,mlt:mt,mnk:man,mo:ro,mol:ro,mon:mn,mri:mi,msa:ms,mst:mry,mup:raj,mwj:vaj,mya:my,myd:aog,myt:mry,nad:xny,nau:na,nav:nv,nbl:nr,ncp:kdz,nde:nd,ndo:ng,nep:ne,nld:nl,nno:nn,nns:nbr,nnx:ngv,no:nb,nob:nb,nor:nb,npi:ne,nts:pij,nya:ny,oci:oc,ojg:oj,oji:oj,ori:or,orm:om,ory:or,oss:os,oun:vaj,pan:pa,pbu:ps,pcr:adx,per:fa,pes:fa,pli:pi,plt:mg,pmc:huw,pmu:phr,pnb:lah,pol:pl,por:pt,ppa:bfy,ppr:lcq,pry:prt,pus:ps,puz:pub,que:qu,quz:qu,rmy:rom,roh:rm,ron:ro,rum:ro,run:rn,rus:ru,sag:sg,san:sa,sca:hle,scc:sr,scr:hr,sin:si,skk:oyb,slk:sk,slo:sk,slv:sl,sme:se,smo:sm,sna:sn,snd:sd,som:so,sot:st,spa:es,spy:kln,sqi:sq,src:sc,srd:sc,srp:sr,ssw:ss,sun:su,swa:sw,swe:sv,swh:sw,tah:ty,tam:ta,tat:tt,tdu:dtp,tel:te,tgk:tg,tgl:fil,tha:th,thc:tpo,thx:oyb,tib:bo,tie:ras,tir:ti,tkk:twm,tl:fil,tlw:weo,tmp:tyj,tne:kak,ton:to,tsf:taj,tsn:tn,tso:ts,ttq:tmh,tuk:tk,tur:tr,tw:ak,twi:ak,uig:ug,ukr:uk,umu:del,uok:ema,urd:ur,uzb:uz,uzn:uz,ven:ve,vie:vi,vol:vo,wel:cy,wln:wa,wol:wo,xba:cax,xho:xh,xia:acn,xkh:waw,xpe:kpe,xsj:suj,xsl:den,ybd:rki,ydd:yi,yid:yi,yma:lrr,ymt:mtm,yor:yo,yos:zom,yuu:yug,zai:zap,zha:za,zho:zh,zsm:ms,zul:zu,zyb:za'),
    clang: I$table('cnr:sr--ME,drw:fa--AF,hbs:sr-Latn-,prs:fa--AF,sh:sr-Latn-,swc:sw--CD,tnf:fa--AF'),
    region: I$table('100:BG,104:MM,108:BI,112:BY,116:KH,120:CM,124:CA,132:CV,136:KY,140:CF,144:LK,148:TD,152:CL,156:CN,158:TW,162:CX,166:CC,170:CO,174:KM,175:YT,178:CG,180:CD,184:CK,188:CR,191:HR,192:CU,196:CY,203:CZ,204:BJ,208:DK,212:DM,214:DO,218:EC,222:SV,226:GQ,230:ET,231:ET,232:ER,233:EE,234:FO,238:FK,239:GS,242:FJ,246:FI,248:AX,249:FR,250:FR,254:GF,258:PF,260:TF,262:DJ,266:GA,268:GE,270:GM,275:PS,276:DE,278:DE,280:DE,288:GH,292:GI,296:KI,300:GR,304:GL,308:GD,312:GP,316:GU,320:GT,324:GN,328:GY,332:HT,334:HM,336:VA,340:HN,344:HK,348:HU,352:IS,356:IN,360:ID,364:IR,368:IQ,372:IE,376:IL,380:IT,384:CI,388:JM,392:JP,398:KZ,400:JO,404:KE,408:KP,410:KR,414:KW,417:KG,418:LA,422:LB,426:LS,428:LV,430:LR,434:LY,438:LI,440:LT,442:LU,446:MO,450:MG,454:MW,458:MY,462:MV,466:ML,470:MT,474:MQ,478:MR,480:MU,484:MX,492:MC,496:MN,498:MD,499:ME,500:MS,504:MA,508:MZ,512:OM,516:NA,520:NR,524:NP,528:NL,531:CW,533:AW,534:SX,535:BQ,540:NC,548:VU,554:NZ,558:NI,562:NE,566:NG,570:NU,574:NF,578:NO,580:MP,581:UM,583:FM,584:MH,585:PW,586:PK,591:PA,598:PG,600:PY,604:PE,608:PH,612:PN,616:PL,620:PT,624:GW,626:TL,630:PR,634:QA,638:RE,642:RO,643:RU,646:RW,652:BL,654:SH,659:KN,660:AI,662:LC,663:MF,666:PM,670:VC,674:SM,678:ST,682:SA,686:SN,688:RS,690:SC,694:SL,702:SG,703:SK,704:VN,705:SI,706:SO,710:ZA,716:ZW,720:YE,724:ES,728:SS,729:SD,732:EH,736:SD,740:SR,744:SJ,748:SZ,752:SE,756:CH,760:SY,762:TJ,764:TH,768:TG,772:TK,776:TO,780:TT,784:AE,788:TN,792:TR,795:TM,796:TC,798:TV,800:UG,804:UA,807:MK,818:EG,826:GB,830:JE,831:GG,832:JE,833:IM,834:TZ,840:US,850:VI,854:BF,858:UY,860:UZ,862:VE,876:WF,882:WS,886:YE,887:YE,891:RS,894:ZM,958:AA,959:QM,960:QN,962:QP,963:QQ,964:QR,965:QS,966:QT,967:EU,968:QV,969:QW,970:QX,971:QY,972:QZ,973:XA,974:XB,975:XC,976:XD,977:XE,978:XF,979:XG,980:XH,981:XI,982:XJ,983:XK,984:XL,985:XM,986:XN,987:XO,988:XP,989:XQ,990:XR,991:XS,992:XT,993:XU,994:XV,995:XW,996:XX,997:XY,998:XZ,999:ZZ,004:AF,008:AL,010:AQ,012:DZ,016:AS,020:AD,024:AO,028:AG,031:AZ,032:AR,036:AU,040:AT,044:BS,048:BH,050:BD,051:AM,052:BB,056:BE,060:BM,062:034,064:BT,068:BO,070:BA,072:BW,074:BV,076:BR,084:BZ,086:IO,090:SB,092:VG,096:BN,BU:MM,CS:RS,CT:KI,DD:DE,DY:BJ,FQ:AQ,FX:FR,HV:BF,JT:UM,MI:UM,NH:VU,NQ:AQ,PU:UM,PZ:PA,QU:EU,RH:ZW,TP:TL,UK:GB,VD:VN,WK:UM,YD:YE,YU:RS,ZR:CD'),
    cregion,
    langVariant: I$table('art-lojban:jbo,cel-gaulish:xtg,zh-guoyu:zh,zh-hakka:hak,zh-xiang:hsn,no-bokmal:nb,no-nynorsk:nn,aa-saaho:ssy'),
    langRegion: I$table('sgn-BR:bzs,sgn-CO:csn,sgn-DE:gsg,sgn-DK:dsl,sgn-ES:ssp,sgn-FR:fsl,sgn-GB:bfi,sgn-GR:gss,sgn-IE:isg,sgn-IT:ise,sgn-JP:jsl,sgn-MX:mfs,sgn-NI:ncs,sgn-NL:dse,sgn-NO:nsl,sgn-PT:psr,sgn-SE:swl,sgn-US:ase,sgn-ZA:sfs'),
    variant: I$table('aaland:rAX,arevela:lhy,arevmda:lhyw,heploc:valalc97,polytoni:vpolyton'),
    script: I$table('qaai:zinh'),
    uni,
    tr: { d0: I$table('name:charname'), m0: I$table('names:prprname') }
  };
});

// subtags are already lower case
const I$canonLangId = r => {
  const a = I$aliasData();
  let v;
  for (let i = 0; i < r.variants.length; i++) {
    v = a.langVariant[r.lang + '-' + r.variants[i]];
    if (v !== undefined) {
      r.lang = v;
      r.variants.splice(i, 1);
      break;
    }
  }
  if (r.region) {
    v = a.langRegion[r.lang + '-' + I$asciiUpper(r.region)];
    if (v !== undefined) {
      r.lang = v;
      r.region = '';
    }
  }
  v = a.lang[r.lang];
  if (v !== undefined) r.lang = v;
  else {
    v = a.clang[r.lang];
    if (v !== undefined) {
      const parts = I$splitStr(v, '-');
      r.lang = parts[0];
      if (!r.script && parts[1]) r.script = I$asciiLower(parts[1]);
      if (!r.region && parts[2]) r.region = I$asciiLower(parts[2]);
    }
  }
  // hepburn-heploc -> alalc97
  if (I$contains(r.variants, 'heploc') && I$contains(r.variants, 'hepburn')) r.variants.splice(I$indexOf(r.variants, 'hepburn'), 1);
  for (let i = 0; i < r.variants.length; i++) {
    v = a.variant[r.variants[i]];
    if (v === undefined) continue;
    const kind = v[0], repl = v.slice(1);
    if (kind === 'v') {
      r.variants[i] = repl;
      continue;
    }
    if (kind === 'l') r.lang = repl;
    else if (kind === 'r') r.region = I$asciiLower(repl);
    r.variants.splice(i, 1);
    i--;
  }
  if (r.script && a.script[r.script]) r.script = a.script[r.script];
  if (r.region) {
    const R = I$asciiUpper(r.region);
    v = a.region[R];
    if (v !== undefined) r.region = I$asciiLower(v);
    else {
      const m = a.cregion[R];
      if (m !== undefined) {
        const S = r.script ? I$titleCase(r.script) : '';
        v = (S && m[r.lang + '-' + S]) || m[r.lang] || (S && m['und-' + S]) || m[''];
        r.region = I$asciiLower(v);
      }
    }
  }
  I$sortStrings(r.variants);
  return r;
};
const I$langIdString = r => {
  let s = r.lang;
  if (r.script) s += '-' + I$titleCase(r.script);
  if (r.region) s += '-' + I$asciiUpper(r.region);
  for (let i = 0; i < r.variants.length; i++) s += '-' + r.variants[i];
  return s;
};
const I$canonUValue = (key, value) => {
  const m = I$aliasData().uni[key];
  if (m !== undefined && m[value] !== undefined) value = m[value];
  return value;
};
const I$extPairs = exts => {
  const out = [];
  for (let i = 0; i < exts.length; i++) I$push(out, [ exts[i].type, exts[i] ]);
  return out;
};
const I$uExtString = e => {
  let s = 'u', attrs = I$sortStrings(e.attrs.slice());
  for (let i = 0; i < attrs.length; i++) if (i === 0 || attrs[i] !== attrs[i - 1]) s += '-' + attrs[i];
  const kws = [], seenKeys = [];
  for (let i = 0; i < e.kws.length; i++) {
    const k = e.kws[i][0];
    if (I$contains(seenKeys, k)) continue;
    I$push(seenKeys, k);
    I$push(kws, [ k, I$canonUValue(k, e.kws[i][1]) ]);
  }
  I$sortPairs(kws);
  for (let i = 0; i < kws.length; i++) {
    s += '-' + kws[i][0];
    if (kws[i][1] !== '' && kws[i][1] !== 'true') s += '-' + kws[i][1];
  }
  return s;
};
const I$tExtString = e => {
  let s = 't';
  if (e.tlang) s += '-' + I$asciiLower(I$langIdString(I$canonLangId(e.tlang)));
  const fields = [];
  for (let i = 0; i < e.kws.length; i++) I$push(fields, [ e.kws[i][0], e.kws[i][1] ]);
  I$sortPairs(fields);
  const tr = I$aliasData().tr;
  for (let i = 0; i < fields.length; i++) {
    let v = fields[i][1], m = tr[fields[i][0]];
    if (m !== undefined && m[v] !== undefined) v = m[v];
    s += '-' + fields[i][0] + '-' + v;
  }
  return s;
};
const I$canonString = r => {
  I$canonLangId(r);
  let s = I$langIdString(r);
  const exts = r.exts;
  const list = I$extPairs(exts);
  I$sortPairs(list);
  for (let i = 0; i < list.length; i++) {
    const e = list[i][1];
    if (e.type === 'u') s += '-' + I$uExtString(e);
    else if (e.type === 't') s += '-' + I$tExtString(e);
    else s += '-' + e.type + '-' + e.value;
  }
  if (r.pu) s += '-x-' + r.pu;
  return s;
};

const I$tagInfo = I$memo(I$parseTag);
const I$canonicalizeTag = I$memo(tag => {
  const r = I$parseTag(tag);
  if (r === null) throw new RangeError('Incorrect locale information provided');
  return I$canonString(r);
});

const I$LOCALE_BRAND = 'an Intl.Locale';

const I$canonicalizeLocaleList = locales => {
  const seen = [], has = I$objCreate(null);
  if (locales === undefined) return seen;
  let O;
  if (typeof locales === 'string' || I$slotsOf(locales, I$LOCALE_BRAND) !== undefined) O = [ locales ];
  else O = I$toObject(locales);
  const len = I$toLength(O.length);
  for (let k = 0; k < len; k++) {
    const Pk = String(k);
    if (!(Pk in O)) continue;
    const kValue = O[Pk];
    if (typeof kValue !== 'string' && !I$isObj(kValue)) throw new TypeError('Locale must be a string or object');
    const loc = I$slotsOf(kValue, I$LOCALE_BRAND);
    const tag = loc !== undefined ? loc.locale : I$toStr(kValue);
    const canon = I$canonicalizeTag(tag);
    if (has[canon] !== true) {
      has[canon] = true;
      I$push(seen, canon);
    }
  }
  return seen;
};

const I$DEFAULT_LOCALE = 'en-US';
const I$availableLangs = I$lazy(() => I$table('af:,am:,ar:,as:,az:,be:,bg:,bn:,bs:,ca:,cs:,cy:,da:,de:,el:,en:,es:,et:,eu:,fa:,fi:,fil:,fr:,ga:,gl:,gu:,gv:,ha:,he:,hi:,hr:,hu:,hy:,id:,ig:,is:,it:,ja:,ka:,kk:,km:,kn:,ko:,ky:,ln:,lo:,lt:,lv:,mk:,ml:,mn:,mr:,ms:,my:,nb:,ne:,nl:,nn:,no:,or:,pa:,pl:,ps:,pt:,ro:,ru:,sd:,si:,sk:,sl:,so:,sq:,sr:,sv:,sw:,ta:,te:,th:,tk:,tr:,uk:,ur:,uz:,vi:,yo:,yue:,zh:,zu:'));
const I$isAvailable = I$memo(locale => {
  const r = I$tagInfo(locale);
  return r !== null && !r.variants.length && !r.exts.length && !r.pu && I$availableLangs()[r.lang] !== undefined;
});
const I$removeUnicodeExt = locale => {
  const x = locale.indexOf('-x-');
  const head = x === -1 ? locale : locale.slice(0, x), tail = x === -1 ? '' : locale.slice(x);
  const u = head.indexOf('-u-');
  if (u === -1) return locale;
  let rest = head.slice(u + 3), parts = I$splitStr(rest, '-'), j = 0;
  while (j < parts.length && parts[j].length !== 1) j++;
  const after = j < parts.length ? '-' + I$join(parts.slice(j), '-') : '';
  return head.slice(0, u) + after + tail;
};
const I$unicodeExtOf = locale => {
  const x = locale.indexOf('-x-');
  const head = x === -1 ? locale : locale.slice(0, x);
  const u = head.indexOf('-u-');
  if (u === -1) return '';
  let parts = I$splitStr(head.slice(u + 1), '-'), j = 1;
  while (j < parts.length && parts[j].length !== 1) j++;
  return '-' + I$join(parts.slice(0, j), '-');
};
const I$bestAvailableLocale = locale => {
  let candidate = locale;
  while (true) {
    if (I$isAvailable(candidate)) return candidate;
    let pos = candidate.lastIndexOf('-');
    if (pos === -1) return undefined;
    if (pos >= 2 && candidate[pos - 2] === '-') pos -= 2;
    candidate = candidate.slice(0, pos);
  }
};
const I$matchInfo = I$memo(locale => [ I$bestAvailableLocale(I$removeUnicodeExt(locale)), I$unicodeExtOf(locale) ]);
const I$lookupMatcher = requested => {
  for (let i = 0; i < requested.length; i++) {
    const m = I$matchInfo(requested[i]);
    if (m[0] !== undefined) return { locale: m[0], extension: m[1] };
  }
  return { locale: I$DEFAULT_LOCALE, extension: '' };
};
const I$uKeywords = ext => {
  let parts = I$splitStr(ext.slice(3), '-'), kws = [], i = 0;
  while (i < parts.length && parts[i].length !== 2) i++;
  while (i < parts.length) {
    const key = parts[i++], vals = [];
    while (i < parts.length && parts[i].length !== 2) I$push(vals, parts[i++]);
    let found = false;
    for (let j = 0; j < kws.length; j++) if (kws[j][0] === key) found = true;
    if (!found) I$push(kws, [ key, I$join(vals, '-') ]);
  }
  return kws;
};
const I$insertUnicodeExt = (locale, keywords) => {
  if (keywords.length === 0) return locale;
  let ext = '-u';
  for (let i = 0; i < keywords.length; i++) {
    ext += '-' + keywords[i][0];
    if (keywords[i][1] !== '') ext += '-' + keywords[i][1];
  }
  const x = locale.indexOf('-x-');
  const s = x === -1 ? locale + ext : locale.slice(0, x) + ext + locale.slice(x);
  return I$canonicalizeTag(s);
};
const I$resolveLocale = (requested, options, relevantKeys, localeData) => {
  const r = I$lookupMatcher(requested);
  const foundLocale = r.locale;
  const keywords = r.extension ? I$uKeywords(r.extension) : [];
  const result = I$objCreate(null);
  result.dataLocale = foundLocale;
  const supported = [];
  for (let i = 0; i < relevantKeys.length; i++) {
    const key = relevantKeys[i];
    const keyData = localeData(foundLocale, key);
    let value = keyData[0], supportedKw = null;
    for (let j = 0; j < keywords.length; j++) {
      if (keywords[j][0] !== key) continue;
      const reqVal = keywords[j][1];
      if (reqVal !== '') {
        if (I$contains(keyData, reqVal)) {
          value = reqVal;
          supportedKw = [ key, value ];
        }
      } else if (I$contains(keyData, 'true')) {
        value = 'true';
        supportedKw = [ key, '' ];
      }
    }
    let optVal = options[key];
    if (typeof optVal === 'string') {
      const low = I$asciiLower(optVal);
      optVal = low === null ? optVal : I$canonUValue(key, low);
      if (optVal === '') optVal = 'true';
    }
    if (optVal !== undefined && optVal !== value && I$contains(keyData, optVal)) {
      value = optVal;
      supportedKw = null;
    }
    if (supportedKw) I$push(supported, supportedKw);
    result[key] = value;
  }
  result.locale = I$insertUnicodeExt(foundLocale, supported);
  return result;
};
const I$supportedLocales = (requested, options) => {
  options = I$coerceOptionsToObject(options);
  I$getLocaleMatcher(options);
  const out = [];
  for (let i = 0; i < requested.length; i++) {
    if (I$matchInfo(requested[i])[0] !== undefined) I$push(out, requested[i]);
  }
  return I$createArray(out);
};

const I$NUMBERING = 'adlm:1e950,ahom:11730,arab:660,arabext:6f0,bali:1b50,beng:9e6,bhks:11c50,brah:11066,cakm:11136,cham:aa50,deva:966,diak:11950,fullwide:ff10,gara:10d40,gong:11da0,gonm:11d50,gujr:ae6,gukh:16130,guru:a66,hanidec:0,hmng:16b50,hmnp:1e140,java:a9d0,kali:a900,kawi:11f50,khmr:17e0,knda:ce6,krai:16d70,lana:1a80,lanatham:1a90,laoo:ed0,latn:30,lepc:1c40,limb:1946,mathbold:1d7ce,mathdbl:1d7d8,mathmono:1d7f6,mathsanb:1d7ec,mathsans:1d7e2,mlym:d66,modi:11650,mong:1810,mroo:16a60,mtei:abf0,mymr:1040,mymrepka:116da,mymrpao:116d0,mymrshan:1090,mymrtlng:a9f0,nagm:1e4f0,newa:11450,nkoo:7c0,olck:1c50,onao:1e5f1,orya:b66,osma:104a0,outlined:1ccf0,rohg:10d30,saur:a8d0,segment:1fbf0,shrd:111d0,sind:112f0,sinh:de6,sora:110f0,sund:1bb0,sunu:11bf0,takr:116c0,talu:19d0,tamldec:be6,telu:c66,thai:e50,tibt:f20,tirh:114d0,tnsa:16ac0,tols:11de0,vaii:a620,wara:118e0,wcho:1e2f0';
const I$numberingTable = I$lazy(() => I$table(I$NUMBERING));
const I$numberingSystems = I$lazy(() => {
  const out = [], parts = I$splitStr(I$NUMBERING, ',');
  for (let i = 0; i < parts.length; i++) I$push(out, parts[i].slice(0, parts[i].indexOf(':')));
  return out;
});
const I$digitsFor = nu => {
  if (nu === 'hanidec') return [ '\u3007', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d', '\u4e03', '\u516b', '\u4e5d' ];
  const z = parseInt(I$numberingTable()[nu], 16), out = [];
  for (let i = 0; i < 10; i++) I$push(out, String.fromCodePoint(z + i));
  return out;
};
const I$CALENDARS = [ 'buddhist', 'chinese', 'coptic', 'dangi', 'ethioaa', 'ethiopic', 'gregory', 'hebrew', 'indian', 'islamic-civil', 'islamic-tbla', 'islamic-umalqura', 'iso8601', 'japanese', 'persian', 'roc' ];
const I$COLLATIONS = [ 'compat', 'dict', 'emoji', 'eor', 'phonebk', 'phonetic', 'pinyin', 'searchjl', 'stroke', 'trad', 'unihan', 'zhuyin' ];
const I$UNITS = [ 'acre', 'bit', 'byte', 'celsius', 'centimeter', 'day', 'degree', 'fahrenheit', 'fluid-ounce', 'foot', 'gallon', 'gigabit', 'gigabyte', 'gram', 'hectare', 'hour', 'inch', 'kilobit', 'kilobyte', 'kilogram', 'kilometer', 'liter', 'megabit', 'megabyte', 'meter', 'microsecond', 'mile', 'mile-scandinavian', 'milliliter', 'millimeter', 'millisecond', 'minute', 'month', 'nanosecond', 'ounce', 'percent', 'petabyte', 'pound', 'second', 'stone', 'terabit', 'terabyte', 'week', 'yard', 'year' ];

const I$likelyData = I$lazy(() => I$table('aa:Latn-ET,aaa:Latn-NG,aae:Latn-IT,aao:Arab-DZ,aas:Latn-TZ,ab:Cyrl-GE,abc:Latn-PH,acn:Latn-CN,adx:Tibt-CN,ae:Avst-IR,af:Latn-ZA,ago:Latn-PG,ak:Latn-GH,akk:Xsux-IQ,am:Ethi-ET,ami:Latn-TW,an:Latn-ES,aog:Latn-PG,apc:Arab-SY,ar:Arab-EG,arc:Armi-IR,ary:Arab-MA,as:Beng-IN,ast:Latn-ES,av:Cyrl-RU,ay:Latn-BO,az:Latn-AZ,ba:Cyrl-RU,bal:Arab-PK,ban:Latn-ID,bap:Deva-NP,bar:Latn-AT,bax:Bamu-CM,bcg:Latn-GN,be:Cyrl-BY,bfy:Deva-IN,bg:Cyrl-BG,bgx:Grek-TR,bho:Deva-IN,bi:Latn-VU,bik:Latn-PH,bit:Latn-PG,bm:Latn-ML,bmf:Latn-SL,bn:Beng-BD,bnc:Latn-PH,bnn:Latn-TW,bo:Tibt-CN,bob:Latn-KE,bok:Latn-CG,br:Latn-FR,bs:Latn-BA,btv:Deva-PK,bua:Cyrl-RU,bye:Latn-PG,ca:Latn-ES,can:Latn-PG,cax:Latn-BO,cde:Telu-IN,ce:Cyrl-RU,ch:Latn-GU,chm:Cyrl-RU,chr:Cher-US,cir:Latn-NC,cja:Arab-KH,ckb:Arab-IQ,cmr:Latn-MM,co:Latn-FR,cop:Copt-EG,cr:Cans-CA,crh:Cyrl-UA,cs:Latn-CZ,cu:Cyrl-RU,cup:Latn-US,cv:Cyrl-RU,cy:Latn-GB,da:Latn-DK,de:Latn-DE,def:Arab-IR,del:Latn-US,den:Latn-CA,dev:Latn-PG,dif:Latn-AU,din:Latn-SS,dni:Latn-ID,doi:Deva-IN,don:Latn-PG,drl:Latn-AU,dtp:Latn-MY,duz:Latn-CM,dv:Thaa-MV,dz:Tibt-BT,ecy:Cprt-CY,ee:Latn-GH,egy:Egyp-EG,el:Grek-GR,ema:Latn-NG,en:Latn-US,end:Latn-ID,eo:Latn-001,era:Taml-IN,err:Latn-AU,es:Latn-ES,et:Latn-EE,eu:Latn-ES,fa:Arab-IR,ff:Latn-SN,fi:Latn-FI,fil:Latn-PH,fit:Latn-SE,fj:Latn-FJ,fo:Latn-FO,for:Latn-PG,fr:Latn-FR,frc:Latn-US,frd:Latn-ID,frk:Latn-DE,frm:Latn-FR,fro:Latn-FR,frp:Latn-FR,frq:Latn-PG,frr:Latn-DE,frs:Latn-DE,frt:Latn-VU,fy:Latn-NL,ga:Latn-IE,gag:Latn-MD,gal:Latn-TL,gba:Latn-CF,gd:Latn-GB,gdj:Latn-AU,gl:Latn-ES,gmy:Linb-GR,gn:Latn-PY,gon:Deva-IN,got:Goth-UA,grb:Latn-LR,gu:Gujr-IN,gv:Latn-IM,gvr:Deva-NP,ha:Latn-NG,hai:Latn-CA,hak:Hans-CN,haw:Latn-US,he:Hebr-IL,hi:Deva-IN,hif:Deva-FJ,hmn:Latn-CN,hnj:Hmnp-US,ho:Latn-PG,hr:Latn-HR,hsn:Hans-CN,ht:Latn-HT,hu:Latn-HU,huw:Latn-ID,hy:Armn-AM,hyw:Armn-AM,hz:Latn-NA,ia:Latn-001,id:Latn-ID,ie:Latn-EE,ig:Latn-NG,ii:Yiii-CN,ik:Latn-US,io:Latn-001,is:Latn-IS,isn:Latn-TZ,iso:Latn-NG,it:Latn-IT,iu:Cans-CA,ja:Jpan-JP,jal:Latn-ID,jbo:Latn-001,jrb:Hebr-IL,jv:Latn-ID,ka:Geor-GE,kaa:Cyrl-UZ,kac:Latn-MM,kak:Latn-PH,kaw:Bali-ID,kbd:Cyrl-RU,kdt:Thai-TH,kdz:Latn-CM,kg:Latn-CD,khb:Talu-CN,kht:Mymr-IN,ki:Latn-KE,kj:Latn-NA,kk:Cyrl-KZ,kl:Latn-GL,kln:Latn-KE,km:Khmr-KH,kml:Latn-PH,kn:Knda-IN,knn:Deva-IN,ko:Kore-KR,kok:Deva-IN,kpe:Latn-LR,kr:Latn-NG,krl:Latn-RU,krw:Latn-LR,ks:Arab-IN,ktz:Latn-NA,ku:Latn-TR,kv:Cyrl-RU,kw:Latn-GB,kwv:Latn-TD,ky:Cyrl-KG,la:Latn-VA,lah:Arab-PK,lb:Latn-LU,lcp:Thai-CN,lcq:Latn-ID,let:Latn-PG,lg:Latn-UG,li:Latn-NL,lis:Lisu-CN,ln:Latn-CD,lo:Laoo-LA,lol:Latn-CD,lt:Latn-LT,ltg:Latn-LV,lu:Latn-CD,lud:Latn-RU,lul:Latn-SS,luy:Latn-KE,lv:Latn-LV,mai:Deva-IN,man:Latn-GM,mfa:Arab-TH,mg:Latn-MG,mh:Latn-MH,mi:Latn-NZ,min:Latn-ID,mk:Cyrl-MK,ml:Mlym-IN,mn:Cyrl-MN,mni:Beng-IN,mnw:Mymr-MM,mom:Latn-NI,mr:Deva-IN,mry:Latn-PH,ms:Latn-MY,mt:Latn-MT,mtm:Cyrl-RU,mwr:Deva-IN,my:Mymr-MM,na:Latn-NR,nan:Hans-CN,nb:Latn-NO,nbr:Latn-NG,nd:Latn-ZW,ne:Deva-NP,new:Deva-NP,ng:Latn-NA,ngt:Laoo-LA,ngv:Latn-CM,nl:Latn-NL,nn:Latn-NO,no:Latn-NO,nod:Lana-TH,non:Runr-SE,not:Latn-PE,now:Latn-TZ,nr:Latn-ZA,nun:Latn-MM,nv:Latn-US,ny:Latn-MW,nyc:Latn-CD,nyn:Latn-UG,oc:Latn-FR,oj:Cans-CA,om:Latn-ET,one:Latn-CA,opa:Latn-NG,or:Orya-IN,os:Cyrl-GE,osa:Osge-US,pa:Guru-IN,pap:Latn-CW,pau:Latn-PW,pdt:Latn-CA,peo:Xpeo-IR,phn:Phnx-LB,phr:Arab-PK,pi:Sinh-IN,pij:Latn-CO,pl:Latn-PL,prc:Arab-AF,pre:Latn-ST,prt:Thai-TH,ps:Arab-AF,pt:Latn-BR,pub:Latn-IN,pwn:Latn-TW,qu:Latn-PE,raj:Deva-IN,rhg:Rohg-MM,rki:Mymr-MM,rm:Latn-CH,rmx:Latn-VN,rn:Latn-BI,ro:Latn-RO,roc:Latn-VN,rom:Latn-RO,ru:Cyrl-RU,rue:Cyrl-UA,rw:Latn-RW,sa:Deva-IN,sat:Olck-IN,sc:Latn-IT,sd:Arab-PK,se:Latn-NO,sec:Latn-CA,set:Latn-ID,sg:Latn-CF,sga:Latn-IE,sgs:Latn-LT,si:Sinh-LK,sk:Latn-SK,sl:Latn-SI,sm:Latn-WS,sn:Latn-ZW,snz:Latn-PG,so:Latn-SO,sog:Sogd-UZ,sq:Latn-AL,sr:Cyrl-RS,srx:Deva-IN,ss:Latn-ZA,st:Latn-ZA,str:Latn-CA,su:Latn-ID,sub:Latn-CD,suj:Latn-TZ,suz:Sunu-NP,sv:Latn-SE,sw:Latn-TZ,swb:Arab-YT,syr:Syrc-IQ,ta:Taml-IN,tag:Latn-SD,taj:Deva-NP,tao:Latn-TW,tay:Latn-TW,tdd:Tale-CN,te:Telu-IN,tg:Cyrl-TJ,th:Thai-TH,the:Deva-NP,thu:Latn-SS,ti:Ethi-ET,tk:Latn-TM,tkl:Latn-TK,tkr:Latn-AZ,tly:Latn-AZ,tmh:Latn-NE,tn:Latn-ZA,to:Latn-TO,tpi:Latn-PG,tr:Latn-TR,trv:Latn-TW,ts:Latn-ZA,tsu:Latn-TW,tt:Cyrl-RU,ttt:Latn-AZ,tue:Latn-CO,tvd:Latn-NG,tvl:Latn-TV,twm:Deva-IN,two:Latn-BW,txo:Toto-IN,ty:Latn-PF,tyj:Latn-VN,ug:Arab-CN,uga:Ugar-SY,uk:Cyrl-UA,unr:Beng-IN,ur:Arab-PK,uz:Latn-UZ,vai:Vaii-LR,vaj:Latn-NA,ve:Latn-ZA,vi:Latn-VN,vic:Latn-SX,vo:Latn-001,vro:Latn-EE,wa:Latn-BE,waw:Latn-BR,wed:Latn-PG,weo:Latn-ID,wo:Latn-SN,won:Latn-CD,xch:Latn-US,xco:Chrs-UZ,xh:Latn-ZA,xmf:Geor-GE,xny:Latn-AU,yam:Latn-CM,yes:Latn-NG,yet:Latn-ID,yi:Hebr-UA,yo:Latn-NG,yrl:Latn-BR,yue:Hant-HK,yug:Cyrl-RU,za:Latn-CN,zap:Latn-MX,zgh:Tfng-MA,zh:Hans-CN,zom:Latn-IN,zu:Latn-ZA,zza:Latn-TR,AD:ca-Latn,AE:ar-Arab,AF:fa-Arab,AL:sq-Latn,AM:hy-Armn,AN:pap-Latn,AO:pt-Latn,AR:es-Latn,AS:sm-Latn,AT:de-Latn,AW:nl-Latn,AX:sv-Latn,AZ:az-Latn,BA:bs-Latn,BD:bn-Beng,BE:nl-Latn,BF:fr-Latn,BG:bg-Cyrl,BH:ar-Arab,BI:rn-Latn,BJ:fr-Latn,BL:fr-Latn,BN:ms-Latn,BO:es-Latn,BQ:pap-Latn,BR:pt-Latn,BT:dz-Tibt,BU:my-Mymr,BV:no-Latn,BY:be-Cyrl,CC:ms-Arab,CD:fr-Latn,CF:sg-Latn,CG:fr-Latn,CH:de-Latn,CI:fr-Latn,CL:es-Latn,CM:fr-Latn,CN:zh-Hans,CO:es-Latn,CR:es-Latn,CS:sr-Cyrl,CU:es-Latn,CV:pt-Latn,CW:pap-Latn,CY:el-Grek,CZ:cs-Latn,DD:de-Latn,DE:de-Latn,DJ:fr-Latn,DK:da-Latn,DO:es-Latn,DY:fr-Latn,DZ:ar-Arab,EA:es-Latn,EC:es-Latn,EE:et-Latn,EG:ar-Arab,EH:ar-Arab,ER:ti-Ethi,ES:es-Latn,ET:am-Ethi,FI:fi-Latn,FO:fo-Latn,FR:fr-Latn,FX:fr-Latn,GA:fr-Latn,GE:ka-Geor,GF:fr-Latn,GH:ak-Latn,GL:kl-Latn,GN:fr-Latn,GP:fr-Latn,GQ:es-Latn,GR:el-Grek,GT:es-Latn,GW:pt-Latn,HK:zh-Hant,HN:es-Latn,HR:hr-Latn,HT:ht-Latn,HU:hu-Latn,HV:fr-Latn,IC:es-Latn,ID:id-Latn,IL:he-Hebr,IN:hi-Deva,IQ:ar-Arab,IR:fa-Arab,IS:is-Latn,IT:it-Latn,JO:ar-Arab,JP:ja-Jpan,KE:sw-Latn,KG:ky-Cyrl,KH:km-Khmr,KM:ar-Arab,KP:ko-Kore,KR:ko-Kore,KW:ar-Arab,KZ:ru-Cyrl,LA:lo-Laoo,LB:ar-Arab,LI:de-Latn,LK:si-Sinh,LS:st-Latn,LT:lt-Latn,LU:fr-Latn,LV:lv-Latn,LY:ar-Arab,MA:ar-Arab,MC:fr-Latn,MD:ro-Latn,ME:sr-Latn,MF:fr-Latn,MG:mg-Latn,MK:mk-Cyrl,ML:bm-Latn,MM:my-Mymr,MN:mn-Cyrl,MO:zh-Hant,MQ:fr-Latn,MR:ar-Arab,MT:mt-Latn,MU:fr-Latn,MV:dv-Thaa,MX:es-Latn,MY:ms-Latn,MZ:pt-Latn,NA:af-Latn,NC:fr-Latn,NE:ha-Latn,NH:bi-Latn,NI:es-Latn,NL:nl-Latn,NO:nb-Latn,NP:ne-Deva,NT:ar-Arab,OM:ar-Arab,PA:es-Latn,PE:es-Latn,PF:fr-Latn,PG:tpi-Latn,PH:fil-Latn,PK:ur-Arab,PL:pl-Latn,PM:fr-Latn,PR:es-Latn,PS:ar-Arab,PT:pt-Latn,PW:pau-Latn,PY:gn-Latn,PZ:es-Latn,QA:ar-Arab,RE:fr-Latn,RH:sn-Latn,RO:ro-Latn,RS:sr-Cyrl,RU:ru-Cyrl,RW:rw-Latn,SA:ar-Arab,SC:fr-Latn,SD:ar-Arab,SE:sv-Latn,SI:sl-Latn,SJ:nb-Latn,SK:sk-Latn,SM:it-Latn,SN:wo-Latn,SO:so-Latn,SR:nl-Latn,SS:ar-Arab,ST:pt-Latn,SU:ru-Cyrl,SV:es-Latn,SY:ar-Arab,TD:ar-Arab,TF:fr-Latn,TG:fr-Latn,TH:th-Thai,TJ:tg-Cyrl,TK:tkl-Latn,TL:pt-Latn,TM:tk-Latn,TN:ar-Arab,TO:to-Latn,TP:pt-Latn,TR:tr-Latn,TV:tvl-Latn,TW:zh-Hant,TZ:sw-Latn,UA:uk-Cyrl,UG:sw-Latn,UY:es-Latn,UZ:uz-Latn,VA:it-Latn,VD:vi-Latn,VE:es-Latn,VN:vi-Latn,VU:bi-Latn,WF:fr-Latn,WS:sm-Latn,XK:sq-Latn,YD:ar-Arab,YE:ar-Arab,YT:fr-Latn,YU:sr-Cyrl,ZR:fr-Latn,ZW:sn-Latn,419:es-Latn,Adlm:ff-GN,Arab:ar-EG,Armn:hy-AM,Bali:ban-ID,Beng:bn-BD,Bopo:zh-TW,Brai:fr-FR,Cans:iu-CA,Cher:chr-US,Cyrl:ru-RU,Deva:hi-IN,Ethi:am-ET,Geor:ka-GE,Grek:el-GR,Gujr:gu-IN,Guru:pa-IN,Hang:ko-KR,Hani:zh-CN,Hans:zh-CN,Hant:zh-TW,Hebr:he-IL,Hira:ja-JP,Jamo:ko-KR,Jpan:ja-JP,Kana:ja-JP,Khmr:km-KH,Knda:kn-IN,Kore:ko-KR,Laoo:lo-LA,Mlym:ml-IN,Mong:mn-CN,Mymr:my-MM,Olck:sat-IN,Orya:or-IN,Shaw:en-GB,Sinh:si-LK,Taml:ta-IN,Telu:te-IN,Thaa:dv-MV,Thai:th-TH,Tibt:bo-CN,Tfng:zgh-MA,Vaii:vai-LR,Yiii:ii-CN,Copt:cop-EG,Goth:got-UA,Runr:non-SE,Syrc:syr-IQ,Ogam:sga-IE,Bamu:bax-CM,Lisu:lis-CN,Java:jv-ID,Sund:su-ID,Tale:tdd-CN,Talu:khb-CN,Lana:nod-TH,Nkoo:man-GN,Hmng:hnj-LA,Ugar:uga-SY,Xpeo:peo-IR,Phnx:phn-LB,Egyp:egy-EG,Linb:gmy-GR,Cprt:ecy-CY,Osge:osa-US,Rohg:rhg-MM,Yezi:ku-GE,Toto:txo-IN,Kawi:kaw-ID,Nagm:unr-IN,Gara:wo-SN,Gukh:gvr-NP,Krai:bap-IN,Onao:unr-IN,Sunu:suz-NP,az-IQ:Arab,az-IR:Arab,az-RU:Cyrl,az-Arab:IR,bap-Krai:IN,en-Shaw:GB,ff-Adlm:GN,ha-CM:Arab,ha-SD:Arab,hak-TW:Hant,hak-Hant:TW,hnj-Hmng:LA,kk-AF:Arab,kk-CN:Arab,kk-IR:Arab,kk-MN:Arab,kk-Arab:CN,ku-LB:Arab,ku-Arab:IQ,ku-Yezi:GE,ky-CN:Arab,ky-TR:Latn,ky-Arab:CN,ky-Latn:TR,man-Nkoo:GN,mn-CN:Mong,mn-Mong:CN,ms-CC:Arab,nan-TW:Hant,nan-Hant:TW,pa-PK:Arab,pa-Arab:PK,sd-IN:Deva,sd-Deva:IN,sr-ME:Latn,sr-RO:Latn,sr-TR:Latn,tg-PK:Arab,tg-Arab:PK,ug-KZ:Cyrl,ug-MN:Cyrl,ug-Cyrl:KZ,unr-NP:Deva,unr-Deva:NP,uz-AF:Arab,uz-CN:Cyrl,uz-Arab:AF,yue-CN:Hans,yue-Hans:CN,zh-AU:Hant,zh-BN:Hant,zh-GB:Hant,zh-GF:Hant,zh-HK:Hant,zh-ID:Hant,zh-MO:Hant,zh-PA:Hant,zh-PF:Hant,zh-PH:Hant,zh-PZ:Hant,zh-SR:Hant,zh-TH:Hant,zh-TW:Hant,zh-UK:Hant,zh-US:Hant,zh-VD:Hant,zh-VN:Hant,zh-Bopo:TW,zh-Hant:TW,Arab-AZ:az,Arab-BN:ms,Arab-BU:rhg,Arab-CN:ug,Arab-GB:ur,Arab-ID:ms,Arab-IN:ur,Arab-KH:cja,Arab-MM:rhg,Arab-MN:kk,Arab-MU:ur,Arab-NG:ha,Arab-TH:mfa,Arab-TJ:fa,Arab-TR:apc,Arab-UK:ur,Arab-YT:swb,Cyrl-AF:kaa,Cyrl-AL:mk,Cyrl-AZ:az,Cyrl-BA:sr,Cyrl-GE:ab,Cyrl-GR:mk,Cyrl-IR:kaa,Cyrl-MD:uk,Cyrl-ME:sr,Cyrl-RO:bg,Cyrl-SK:uk,Cyrl-TR:kbd,Cyrl-UZ:uz,Cyrl-XK:sr,Deva-BT:ne,Deva-FJ:hif,Deva-MU:bho,Deva-PK:btv,Grek-TR:bgx,Hant-CA:yue,Hant-CN:yue,Hebr-SE:yi,Hebr-UA:yi,Hebr-US:yi,Latn-AF:tk,Latn-AM:ku,Latn-BU:kac,Latn-CN:za,Latn-CS:sr,Latn-CY:tr,Latn-DZ:fr,Latn-GE:ku,Latn-IR:tk,Latn-KM:fr,Latn-MA:fr,Latn-MK:sq,Latn-MM:kac,Latn-MR:fr,Latn-RS:sr,Latn-RU:krl,Latn-SU:krl,Latn-SY:ku,Latn-TD:fr,Latn-TN:fr,Latn-TW:trv,Latn-UA:pl,Latn-YU:sr,Mymr-IN:kht,Mymr-TH:mnw,Thai-CN:lcp,Thai-KH:kdt,Thai-LA:kdt,Zinh-AD:ca,Zinh-AE:ar,Zinh-AF:fa,Zinh-AL:sq,Zinh-AM:hy,Zinh-AN:pap,Zinh-AO:pt,Zinh-AR:es,Zinh-AS:sm,Zinh-AT:de,Zinh-AW:nl,Zinh-AX:sv,Zinh-AZ:az,Zinh-BA:bs,Zinh-BD:bn,Zinh-BE:nl,Zinh-BF:fr,Zinh-BG:bg,Zinh-BH:ar,Zinh-BI:rn,Zinh-BJ:fr,Zinh-BL:fr,Zinh-BN:ms,Zinh-BO:es,Zinh-BQ:pap,Zinh-BR:pt,Zinh-BT:dz,Zinh-BU:my,Zinh-BV:no,Zinh-BY:be,Zinh-CC:ms,Zinh-CD:fr,Zinh-CF:sg,Zinh-CG:fr,Zinh-CH:de,Zinh-CI:fr,Zinh-CL:es,Zinh-CM:fr,Zinh-CN:zh,Zinh-CO:es,Zinh-CR:es,Zinh-CS:sr,Zinh-CU:es,Zinh-CV:pt,Zinh-CW:pap,Zinh-CY:el,Zinh-CZ:cs,Zinh-DD:de,Zinh-DE:de,Zinh-DJ:fr,Zinh-DK:da,Zinh-DO:es,Zinh-DY:fr,Zinh-DZ:ar,Zinh-EA:es,Zinh-EC:es,Zinh-EE:et,Zinh-EG:ar,Zinh-EH:ar,Zinh-ER:ti,Zinh-ES:es,Zinh-ET:am,Zinh-FI:fi,Zinh-FO:fo,Zinh-FR:fr,Zinh-FX:fr,Zinh-GA:fr,Zinh-GE:ka,Zinh-GF:fr,Zinh-GH:ak,Zinh-GL:kl,Zinh-GN:fr,Zinh-GP:fr,Zinh-GQ:es,Zinh-GR:el,Zinh-GT:es,Zinh-GW:pt,Zinh-HK:zh,Zinh-HN:es,Zinh-HR:hr,Zinh-HT:ht,Zinh-HU:hu,Zinh-HV:fr,Zinh-IC:es,Zinh-ID:id,Zinh-IL:he,Zinh-IN:hi,Zinh-IQ:ar,Zinh-IR:fa,Zinh-IS:is,Zinh-IT:it,Zinh-JO:ar,Zinh-JP:ja,Zinh-KE:sw,Zinh-KG:ky,Zinh-KH:km,Zinh-KM:ar,Zinh-KP:ko,Zinh-KR:ko,Zinh-KW:ar,Zinh-KZ:ru,Zinh-LA:lo,Zinh-LB:ar,Zinh-LI:de,Zinh-LK:si,Zinh-LS:st,Zinh-LT:lt,Zinh-LU:fr,Zinh-LV:lv,Zinh-LY:ar,Zinh-MA:ar,Zinh-MC:fr,Zinh-MD:ro,Zinh-ME:sr,Zinh-MF:fr,Zinh-MG:mg,Zinh-MK:mk,Zinh-ML:bm,Zinh-MM:my,Zinh-MN:mn,Zinh-MO:zh,Zinh-MQ:fr,Zinh-MR:ar,Zinh-MT:mt,Zinh-MU:fr,Zinh-MV:dv,Zinh-MX:es,Zinh-MY:ms,Zinh-MZ:pt,Zinh-NA:af,Zinh-NC:fr,Zinh-NE:ha,Zinh-NH:bi,Zinh-NI:es,Zinh-NL:nl,Zinh-NO:nb,Zinh-NP:ne,Zinh-NT:ar,Zinh-OM:ar,Zinh-PA:es,Zinh-PE:es,Zinh-PF:fr,Zinh-PG:tpi,Zinh-PH:fil,Zinh-PK:ur,Zinh-PL:pl,Zinh-PM:fr,Zinh-PR:es,Zinh-PS:ar,Zinh-PT:pt,Zinh-PW:pau,Zinh-PY:gn,Zinh-PZ:es,Zinh-QA:ar,Zinh-RE:fr,Zinh-RH:sn,Zinh-RO:ro,Zinh-RS:sr,Zinh-RU:ru,Zinh-RW:rw,Zinh-SA:ar,Zinh-SC:fr,Zinh-SD:ar,Zinh-SE:sv,Zinh-SI:sl,Zinh-SJ:nb,Zinh-SK:sk,Zinh-SM:it,Zinh-SN:wo,Zinh-SO:so,Zinh-SR:nl,Zinh-SS:ar,Zinh-ST:pt,Zinh-SU:ru,Zinh-SV:es,Zinh-SY:ar,Zinh-TD:ar,Zinh-TF:fr,Zinh-TG:fr,Zinh-TH:th,Zinh-TJ:tg,Zinh-TK:tkl,Zinh-TL:pt,Zinh-TM:tk,Zinh-TN:ar,Zinh-TO:to,Zinh-TP:pt,Zinh-TR:tr,Zinh-TV:tvl,Zinh-TW:zh,Zinh-TZ:sw,Zinh-UA:uk,Zinh-UG:sw,Zinh-UY:es,Zinh-UZ:uz,Zinh-VA:it,Zinh-VD:vi,Zinh-VE:es,Zinh-VN:vi,Zinh-VU:bi,Zinh-WF:fr,Zinh-WS:sm,Zinh-XK:sq,Zinh-YD:ar,Zinh-YE:ar,Zinh-YT:fr,Zinh-YU:sr,Zinh-ZR:fr,Zinh-ZW:sn,Zinh-419:es,Zyyy-AD:ca,Zyyy-AE:ar,Zyyy-AF:fa,Zyyy-AL:sq,Zyyy-AM:hy,Zyyy-AN:pap,Zyyy-AO:pt,Zyyy-AR:es,Zyyy-AS:sm,Zyyy-AT:de,Zyyy-AW:nl,Zyyy-AX:sv,Zyyy-AZ:az,Zyyy-BA:bs,Zyyy-BD:bn,Zyyy-BE:nl,Zyyy-BF:fr,Zyyy-BG:bg,Zyyy-BH:ar,Zyyy-BI:rn,Zyyy-BJ:fr,Zyyy-BL:fr,Zyyy-BN:ms,Zyyy-BO:es,Zyyy-BQ:pap,Zyyy-BR:pt,Zyyy-BT:dz,Zyyy-BU:my,Zyyy-BV:no,Zyyy-BY:be,Zyyy-CC:ms,Zyyy-CD:fr,Zyyy-CF:sg,Zyyy-CG:fr,Zyyy-CH:de,Zyyy-CI:fr,Zyyy-CL:es,Zyyy-CM:fr,Zyyy-CN:zh,Zyyy-CO:es,Zyyy-CR:es,Zyyy-CS:sr,Zyyy-CU:es,Zyyy-CV:pt,Zyyy-CW:pap,Zyyy-CY:el,Zyyy-CZ:cs,Zyyy-DD:de,Zyyy-DE:de,Zyyy-DJ:fr,Zyyy-DK:da,Zyyy-DO:es,Zyyy-DY:fr,Zyyy-DZ:ar,Zyyy-EA:es,Zyyy-EC:es,Zyyy-EE:et,Zyyy-EG:ar,Zyyy-EH:ar,Zyyy-ER:ti,Zyyy-ES:es,Zyyy-ET:am,Zyyy-FI:fi,Zyyy-FO:fo,Zyyy-FR:fr,Zyyy-FX:fr,Zyyy-GA:fr,Zyyy-GE:ka,Zyyy-GF:fr,Zyyy-GH:ak,Zyyy-GL:kl,Zyyy-GN:fr,Zyyy-GP:fr,Zyyy-GQ:es,Zyyy-GR:el,Zyyy-GT:es,Zyyy-GW:pt,Zyyy-HK:zh,Zyyy-HN:es,Zyyy-HR:hr,Zyyy-HT:ht,Zyyy-HU:hu,Zyyy-HV:fr,Zyyy-IC:es,Zyyy-ID:id,Zyyy-IL:he,Zyyy-IN:hi,Zyyy-IQ:ar,Zyyy-IR:fa,Zyyy-IS:is,Zyyy-IT:it,Zyyy-JO:ar,Zyyy-JP:ja,Zyyy-KE:sw,Zyyy-KG:ky,Zyyy-KH:km,Zyyy-KM:ar,Zyyy-KP:ko,Zyyy-KR:ko,Zyyy-KW:ar,Zyyy-KZ:ru,Zyyy-LA:lo,Zyyy-LB:ar,Zyyy-LI:de,Zyyy-LK:si,Zyyy-LS:st,Zyyy-LT:lt,Zyyy-LU:fr,Zyyy-LV:lv,Zyyy-LY:ar,Zyyy-MA:ar,Zyyy-MC:fr,Zyyy-MD:ro,Zyyy-ME:sr,Zyyy-MF:fr,Zyyy-MG:mg,Zyyy-MK:mk,Zyyy-ML:bm,Zyyy-MM:my,Zyyy-MN:mn,Zyyy-MO:zh,Zyyy-MQ:fr,Zyyy-MR:ar,Zyyy-MT:mt,Zyyy-MU:fr,Zyyy-MV:dv,Zyyy-MX:es,Zyyy-MY:ms,Zyyy-MZ:pt,Zyyy-NA:af,Zyyy-NC:fr,Zyyy-NE:ha,Zyyy-NH:bi,Zyyy-NI:es,Zyyy-NL:nl,Zyyy-NO:nb,Zyyy-NP:ne,Zyyy-NT:ar,Zyyy-OM:ar,Zyyy-PA:es,Zyyy-PE:es,Zyyy-PF:fr,Zyyy-PG:tpi,Zyyy-PH:fil,Zyyy-PK:ur,Zyyy-PL:pl,Zyyy-PM:fr,Zyyy-PR:es,Zyyy-PS:ar,Zyyy-PT:pt,Zyyy-PW:pau,Zyyy-PY:gn,Zyyy-PZ:es,Zyyy-QA:ar,Zyyy-RE:fr,Zyyy-RH:sn,Zyyy-RO:ro,Zyyy-RS:sr,Zyyy-RU:ru,Zyyy-RW:rw,Zyyy-SA:ar,Zyyy-SC:fr,Zyyy-SD:ar,Zyyy-SE:sv,Zyyy-SI:sl,Zyyy-SJ:nb,Zyyy-SK:sk,Zyyy-SM:it,Zyyy-SN:wo,Zyyy-SO:so,Zyyy-SR:nl,Zyyy-SS:ar,Zyyy-ST:pt,Zyyy-SU:ru,Zyyy-SV:es,Zyyy-SY:ar,Zyyy-TD:ar,Zyyy-TF:fr,Zyyy-TG:fr,Zyyy-TH:th,Zyyy-TJ:tg,Zyyy-TK:tkl,Zyyy-TL:pt,Zyyy-TM:tk,Zyyy-TN:ar,Zyyy-TO:to,Zyyy-TP:pt,Zyyy-TR:tr,Zyyy-TV:tvl,Zyyy-TW:zh,Zyyy-TZ:sw,Zyyy-UA:uk,Zyyy-UG:sw,Zyyy-UY:es,Zyyy-UZ:uz,Zyyy-VA:it,Zyyy-VD:vi,Zyyy-VE:es,Zyyy-VN:vi,Zyyy-VU:bi,Zyyy-WF:fr,Zyyy-WS:sm,Zyyy-XK:sq,Zyyy-YD:ar,Zyyy-YE:ar,Zyyy-YT:fr,Zyyy-YU:sr,Zyyy-ZR:fr,Zyyy-ZW:sn,Zyyy-419:es,Nkoo-ML:bm,Dsrt-AD:ca,Dsrt-AE:ar,Dsrt-AF:fa,Dsrt-AL:sq,Dsrt-AM:hy,Dsrt-AN:pap,Dsrt-AO:pt,Dsrt-AR:es,Dsrt-AS:sm,Dsrt-AT:de,Dsrt-AW:nl,Dsrt-AX:sv,Dsrt-AZ:az,Dsrt-BA:bs,Dsrt-BD:bn,Dsrt-BE:nl,Dsrt-BF:fr,Dsrt-BG:bg,Dsrt-BH:ar,Dsrt-BI:rn,Dsrt-BJ:fr,Dsrt-BL:fr,Dsrt-BN:ms,Dsrt-BO:es,Dsrt-BQ:pap,Dsrt-BR:pt,Dsrt-BT:dz,Dsrt-BU:my,Dsrt-BV:no,Dsrt-BY:be,Dsrt-CC:ms,Dsrt-CD:fr,Dsrt-CF:sg,Dsrt-CG:fr,Dsrt-CH:de,Dsrt-CI:fr,Dsrt-CL:es,Dsrt-CM:fr,Dsrt-CN:zh,Dsrt-CO:es,Dsrt-CR:es,Dsrt-CS:sr,Dsrt-CU:es,Dsrt-CV:pt,Dsrt-CW:pap,Dsrt-CY:el,Dsrt-CZ:cs,Dsrt-DD:de,Dsrt-DE:de,Dsrt-DJ:fr,Dsrt-DK:da,Dsrt-DO:es,Dsrt-DY:fr,Dsrt-DZ:ar,Dsrt-EA:es,Dsrt-EC:es,Dsrt-EE:et,Dsrt-EG:ar,Dsrt-EH:ar,Dsrt-ER:ti,Dsrt-ES:es,Dsrt-ET:am,Dsrt-FI:fi,Dsrt-FO:fo,Dsrt-FR:fr,Dsrt-FX:fr,Dsrt-GA:fr,Dsrt-GE:ka,Dsrt-GF:fr,Dsrt-GH:ak,Dsrt-GL:kl,Dsrt-GN:fr,Dsrt-GP:fr,Dsrt-GQ:es,Dsrt-GR:el,Dsrt-GT:es,Dsrt-GW:pt,Dsrt-HK:zh,Dsrt-HN:es,Dsrt-HR:hr,Dsrt-HT:ht,Dsrt-HU:hu,Dsrt-HV:fr,Dsrt-IC:es,Dsrt-ID:id,Dsrt-IL:he,Dsrt-IN:hi,Dsrt-IQ:ar,Dsrt-IR:fa,Dsrt-IS:is,Dsrt-IT:it,Dsrt-JO:ar,Dsrt-JP:ja,Dsrt-KE:sw,Dsrt-KG:ky,Dsrt-KH:km,Dsrt-KM:ar,Dsrt-KP:ko,Dsrt-KR:ko,Dsrt-KW:ar,Dsrt-KZ:ru,Dsrt-LA:lo,Dsrt-LB:ar,Dsrt-LI:de,Dsrt-LK:si,Dsrt-LS:st,Dsrt-LT:lt,Dsrt-LU:fr,Dsrt-LV:lv,Dsrt-LY:ar,Dsrt-MA:ar,Dsrt-MC:fr,Dsrt-MD:ro,Dsrt-ME:sr,Dsrt-MF:fr,Dsrt-MG:mg,Dsrt-MK:mk,Dsrt-ML:bm,Dsrt-MM:my,Dsrt-MN:mn,Dsrt-MO:zh,Dsrt-MQ:fr,Dsrt-MR:ar,Dsrt-MT:mt,Dsrt-MU:fr,Dsrt-MV:dv,Dsrt-MX:es,Dsrt-MY:ms,Dsrt-MZ:pt,Dsrt-NA:af,Dsrt-NC:fr,Dsrt-NE:ha,Dsrt-NH:bi,Dsrt-NI:es,Dsrt-NL:nl,Dsrt-NO:nb,Dsrt-NP:ne,Dsrt-NT:ar,Dsrt-OM:ar,Dsrt-PA:es,Dsrt-PE:es,Dsrt-PF:fr,Dsrt-PG:tpi,Dsrt-PH:fil,Dsrt-PK:ur,Dsrt-PL:pl,Dsrt-PM:fr,Dsrt-PR:es,Dsrt-PS:ar,Dsrt-PT:pt,Dsrt-PW:pau,Dsrt-PY:gn,Dsrt-PZ:es,Dsrt-QA:ar,Dsrt-RE:fr,Dsrt-RH:sn,Dsrt-RO:ro,Dsrt-RS:sr,Dsrt-RU:ru,Dsrt-RW:rw,Dsrt-SA:ar,Dsrt-SC:fr,Dsrt-SD:ar,Dsrt-SE:sv,Dsrt-SI:sl,Dsrt-SJ:nb,Dsrt-SK:sk,Dsrt-SM:it,Dsrt-SN:wo,Dsrt-SO:so,Dsrt-SR:nl,Dsrt-SS:ar,Dsrt-ST:pt,Dsrt-SU:ru,Dsrt-SV:es,Dsrt-SY:ar,Dsrt-TD:ar,Dsrt-TF:fr,Dsrt-TG:fr,Dsrt-TH:th,Dsrt-TJ:tg,Dsrt-TK:tkl,Dsrt-TL:pt,Dsrt-TM:tk,Dsrt-TN:ar,Dsrt-TO:to,Dsrt-TP:pt,Dsrt-TR:tr,Dsrt-TV:tvl,Dsrt-TW:zh,Dsrt-TZ:sw,Dsrt-UA:uk,Dsrt-UG:sw,Dsrt-UY:es,Dsrt-UZ:uz,Dsrt-VA:it,Dsrt-VD:vi,Dsrt-VE:es,Dsrt-VN:vi,Dsrt-VU:bi,Dsrt-WF:fr,Dsrt-WS:sm,Dsrt-XK:sq,Dsrt-YD:ar,Dsrt-YE:ar,Dsrt-YT:fr,Dsrt-YU:sr,Dsrt-ZR:fr,Dsrt-ZW:sn,Dsrt-419:es,Tols-AD:ca,Tols-AE:ar,Tols-AF:fa,Tols-AL:sq,Tols-AM:hy,Tols-AN:pap,Tols-AO:pt,Tols-AR:es,Tols-AS:sm,Tols-AT:de,Tols-AW:nl,Tols-AX:sv,Tols-AZ:az,Tols-BA:bs,Tols-BD:bn,Tols-BE:nl,Tols-BF:fr,Tols-BG:bg,Tols-BH:ar,Tols-BI:rn,Tols-BJ:fr,Tols-BL:fr,Tols-BN:ms,Tols-BO:es,Tols-BQ:pap,Tols-BR:pt,Tols-BT:dz,Tols-BU:my,Tols-BV:no,Tols-BY:be,Tols-CC:ms,Tols-CD:fr,Tols-CF:sg,Tols-CG:fr,Tols-CH:de,Tols-CI:fr,Tols-CL:es,Tols-CM:fr,Tols-CN:zh,Tols-CO:es,Tols-CR:es,Tols-CS:sr,Tols-CU:es,Tols-CV:pt,Tols-CW:pap,Tols-CY:el,Tols-CZ:cs,Tols-DD:de,Tols-DE:de,Tols-DJ:fr,Tols-DK:da,Tols-DO:es,Tols-DY:fr,Tols-DZ:ar,Tols-EA:es,Tols-EC:es,Tols-EE:et,Tols-EG:ar,Tols-EH:ar,Tols-ER:ti,Tols-ES:es,Tols-ET:am,Tols-FI:fi,Tols-FO:fo,Tols-FR:fr,Tols-FX:fr,Tols-GA:fr,Tols-GE:ka,Tols-GF:fr,Tols-GH:ak,Tols-GL:kl,Tols-GN:fr,Tols-GP:fr,Tols-GQ:es,Tols-GR:el,Tols-GT:es,Tols-GW:pt,Tols-HK:zh,Tols-HN:es,Tols-HR:hr,Tols-HT:ht,Tols-HU:hu,Tols-HV:fr,Tols-IC:es,Tols-ID:id,Tols-IL:he,Tols-IN:hi,Tols-IQ:ar,Tols-IR:fa,Tols-IS:is,Tols-IT:it,Tols-JO:ar,Tols-JP:ja,Tols-KE:sw,Tols-KG:ky,Tols-KH:km,Tols-KM:ar,Tols-KP:ko,Tols-KR:ko,Tols-KW:ar,Tols-KZ:ru,Tols-LA:lo,Tols-LB:ar,Tols-LI:de,Tols-LK:si,Tols-LS:st,Tols-LT:lt,Tols-LU:fr,Tols-LV:lv,Tols-LY:ar,Tols-MA:ar,Tols-MC:fr,Tols-MD:ro,Tols-ME:sr,Tols-MF:fr,Tols-MG:mg,Tols-MK:mk,Tols-ML:bm,Tols-MM:my,Tols-MN:mn,Tols-MO:zh,Tols-MQ:fr,Tols-MR:ar,Tols-MT:mt,Tols-MU:fr,Tols-MV:dv,Tols-MX:es,Tols-MY:ms,Tols-MZ:pt,Tols-NA:af,Tols-NC:fr,Tols-NE:ha,Tols-NH:bi,Tols-NI:es,Tols-NL:nl,Tols-NO:nb,Tols-NP:ne,Tols-NT:ar,Tols-OM:ar,Tols-PA:es,Tols-PE:es,Tols-PF:fr,Tols-PG:tpi,Tols-PH:fil,Tols-PK:ur,Tols-PL:pl,Tols-PM:fr,Tols-PR:es,Tols-PS:ar,Tols-PT:pt,Tols-PW:pau,Tols-PY:gn,Tols-PZ:es,Tols-QA:ar,Tols-RE:fr,Tols-RH:sn,Tols-RO:ro,Tols-RS:sr,Tols-RU:ru,Tols-RW:rw,Tols-SA:ar,Tols-SC:fr,Tols-SD:ar,Tols-SE:sv,Tols-SI:sl,Tols-SJ:nb,Tols-SK:sk,Tols-SM:it,Tols-SN:wo,Tols-SO:so,Tols-SR:nl,Tols-SS:ar,Tols-ST:pt,Tols-SU:ru,Tols-SV:es,Tols-SY:ar,Tols-TD:ar,Tols-TF:fr,Tols-TG:fr,Tols-TH:th,Tols-TJ:tg,Tols-TK:tkl,Tols-TL:pt,Tols-TM:tk,Tols-TN:ar,Tols-TO:to,Tols-TP:pt,Tols-TR:tr,Tols-TV:tvl,Tols-TW:zh,Tols-TZ:sw,Tols-UA:uk,Tols-UG:sw,Tols-UY:es,Tols-UZ:uz,Tols-VA:it,Tols-VD:vi,Tols-VE:es,Tols-VN:vi,Tols-VU:bi,Tols-WF:fr,Tols-WS:sm,Tols-XK:sq,Tols-YD:ar,Tols-YE:ar,Tols-YT:fr,Tols-YU:sr,Tols-ZR:fr,Tols-ZW:sn,Tols-419:es'));
const I$addLikely = (lang, script, region) => {
  let t = I$likelyData(), v;
  let L = lang === 'und' ? '' : lang, S = script ? I$titleCase(script) : '', R = region ? I$asciiUpper(region) : '';
  let fromRegion = '', fromScript = '';
  if (R && (v = t[R]) !== undefined) fromRegion = v;
  if (S && (v = t[S]) !== undefined) fromScript = v;
  if (!L) {
    if (S && R && (v = t[S + '-' + R]) !== undefined) L = v;
    else if (fromRegion && (!S || fromRegion.slice(fromRegion.indexOf('-') + 1) === S)) L = fromRegion.slice(0, fromRegion.indexOf('-'));
    else if (fromScript) L = fromScript.slice(0, fromScript.indexOf('-'));
    else L = 'en';
    if (!R && !fromScript && S) R = 'US';
  } else if (t[L] === undefined) return [ L, S, R ];
  const base = t[L];
  if (!S) {
    if (R && (v = t[L + '-' + R]) !== undefined) S = v;
    else if (base !== undefined) S = base.slice(0, base.indexOf('-'));
    else if (fromRegion) S = fromRegion.slice(fromRegion.indexOf('-') + 1);
  }
  if (!R) {
    if (S && (v = t[L + '-' + S]) !== undefined) R = v;
    else if (base !== undefined) R = base.slice(base.indexOf('-') + 1);
    else if (fromScript) R = fromScript.slice(fromScript.indexOf('-') + 1);
  }
  return [ L, S, R ];
};
const I$removeLikely = (lang, script, region) => {
  const max = I$addLikely(lang, script, region);
  if (!max[1] || !max[2]) return max;
  const trials = [ [ max[0], '', '' ], [ max[0], '', max[2] ], [ max[0], max[1], '' ] ];
  for (let i = 0; i < trials.length; i++) {
    const t = I$addLikely(trials[i][0], trials[i][1], trials[i][2]);
    if (t[0] === max[0] && t[1] === max[1] && t[2] === max[2]) return trials[i];
  }
  return max;
};

const I$weekdayToString = fw => {
  const map = [ 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' ];
  if (fw.length === 1 && fw >= '0' && fw <= '7') return map[+fw];
  return fw;
};
const I$localeSubtagOption = (options, prop, valid) => {
  let value = I$getOption(options, prop, 'string', undefined, undefined);
  if (value !== undefined) {
    value = I$asciiLower(value);
    if (value === null || !valid(value)) throw new RangeError('Invalid ' + prop);
  }
  return value;
};
const I$Locale = function Locale(tag, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.Locale requires \'new\'');
  if (typeof tag !== 'string' && !I$isObj(tag)) throw new TypeError('First argument to Intl.Locale must be a string or Locale object');
  const loc = I$slotsOf(tag, I$LOCALE_BRAND);
  tag = loc !== undefined ? loc.locale : I$toStr(tag);
  options = I$coerceOptionsToObject(options);
  let r = I$parseTag(tag);
  if (r === null) throw new RangeError('Incorrect locale information provided');
  r = I$parseTag(I$canonString(r));
  const language = I$localeSubtagOption(options, 'language', I$isLangSub);
  const script = I$localeSubtagOption(options, 'script', I$isScriptSub);
  const region = I$localeSubtagOption(options, 'region', I$isRegionSub);
  const variants = I$getOption(options, 'variants', 'string', undefined, undefined);
  let variantList;
  if (variants !== undefined) {
    const lv = I$asciiLower(variants);
    if (lv === null || lv === '') throw new RangeError('Invalid variants');
    variantList = I$splitStr(lv, '-');
    for (let i = 0; i < variantList.length; i++) {
      if (!I$isVariantSub(variantList[i])) throw new RangeError('Invalid variants');
      for (let j = 0; j < i; j++) if (variantList[j] === variantList[i]) throw new RangeError('Duplicate variant');
    }
  }
  if (language !== undefined) r.lang = language;
  if (script !== undefined) r.script = script;
  if (region !== undefined) r.region = region;
  if (variantList !== undefined) r.variants = variantList;
  tag = I$canonString(r);

  const opt = { ca: undefined, co: undefined, fw: undefined, hc: undefined, kf: undefined, kn: undefined, nu: undefined };
  opt.ca = I$getUTypeOption(options, 'calendar', true);
  opt.co = I$getUTypeOption(options, 'collation', true);
  let fw = I$getOption(options, 'firstDayOfWeek', 'string', undefined, undefined);
  if (fw !== undefined) {
    fw = I$weekdayToString(fw);
    if (!I$isUType(fw)) throw new RangeError('Invalid firstDayOfWeek');
  }
  opt.fw = fw;
  opt.hc = I$getOption(options, 'hourCycle', 'string', [ 'h11', 'h12', 'h23', 'h24' ], undefined);
  opt.kf = I$getOption(options, 'caseFirst', 'string', [ 'upper', 'lower', 'false' ], undefined);
  let kn = I$getOption(options, 'numeric', 'boolean', undefined, undefined);
  if (kn !== undefined) kn = String(kn);
  opt.kn = kn;
  opt.nu = I$getUTypeOption(options, 'numberingSystem', true);

  r = I$parseTag(tag);
  let uext = null;
  for (let i = 0; i < r.exts.length; i++) if (r.exts[i].type === 'u') uext = r.exts[i];
  if (uext === null) {
    uext = { type: 'u', attrs: [], kws: [], tlang: null, value: '' };
    I$push(r.exts, uext);
  }
  const keys = [ 'ca', 'co', 'fw', 'hc', 'kf', 'kn', 'nu' ];
  const slots = { locale: '', ca: undefined, co: undefined, fw: undefined, hc: undefined, kf: undefined, kn: undefined, nu: undefined };
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i], value = undefined, entry = null;
    for (let j = 0; j < uext.kws.length; j++) {
      if (uext.kws[j][0] === key) {
        entry = uext.kws[j];
        break;
      }
    }
    if (entry) value = I$canonUValue(key, entry[1]);
    const ov = opt[key];
    if (ov !== undefined) {
      value = I$canonUValue(key, I$asciiLower(ov));
      if (entry) entry[1] = value;
      else I$push(uext.kws, [ key, value ]);
    }
    if (value === 'true' && key !== 'kn') value = '';
    slots[key] = value;
  }
  if (uext.attrs.length === 0 && uext.kws.length === 0) r.exts.splice(I$indexOf(r.exts, uext), 1);
  slots.locale = I$canonString(r);
  I$setSlots(this, I$LOCALE_BRAND, slots);
};
const I$localeTail = locale => locale.slice(I$langIdString(I$parseTag(locale)).length);
const I$REGION_HOUR12 = I$table('US:,CA:,AU:,NZ:,IN:,PK:,BD:,EG:,SA:,PH:,MX:,CO:,KR:,TW:,MY:,AE:,JO:,IQ:,SY:,LB:,KW:,QA:,OM:,BH:,YE:,LY:,SD:,DZ:,TN:,MA:');
const I$REGION_SUNDAY = I$table('US:,CA:,MX:,BR:,JP:,KR:,TW:,HK:,IN:,IL:,PH:,ZA:,SA:,AU:,AR:,CO:,PE:,VE:,GT:,HN:,NI:,PA:,DO:,PR:,SV:,BO:,PY:,TH:,ID:,KE:,ZW:,BS:,BZ:,JM:,PK:,BT:,KH:,LA:,MM:,NP:,MO:,SG:,WS:,UM:,VI:,GU:,AS:,MH:,ET:,MZ:,YE:');
const I$RTL_SCRIPTS = I$table('Arab:,Hebr:,Thaa:,Syrc:,Nkoo:,Adlm:,Rohg:,Mand:,Samr:');
const I$localeRegionOrLikely = s => {
  const r = I$parseTag(s.locale);
  if (r.region) return I$asciiUpper(r.region);
  return I$addLikely(r.lang, r.script, '')[2];
};
const I$likelyLocale = (s, minimize) => {
  const r = I$parseTag(s.locale);
  const m = minimize ? I$removeLikely(r.lang, r.script, r.region) : I$addLikely(r.lang, r.script, r.region);
  const id = { lang: m[0], script: m[1], region: m[2], variants: r.variants };
  return new I$Locale(I$langIdString(id) + I$localeTail(s.locale));
};

const I$zoneData = I$lazy(() => {
  const names = [], lower = I$objCreate(null), region = I$objCreate(null);
  const groups = I$splitStr('Africa>Abidjan=CI,Accra=GH,Addis_Ababa=ET,Algiers=DZ,Asmara,Asmera=ER,Bamako=ML,Bangui=CF,Banjul=GM,Bissau=GW,Blantyre=MW,Brazzaville=CG,Bujumbura=BI,Cairo=EG,Casablanca=MA,Ceuta=ES,Conakry=GN,Dakar=SN,Dar_es_Salaam=TZ,Djibouti=DJ,Douala=CM,El_Aaiun=EH,Freetown=SL,Gaborone=BW,Harare=ZW,Johannesburg=ZA,Juba=SS,Kampala=UG,Khartoum=SD,Kigali=RW,Kinshasa=ZR,Lagos=NG,Libreville=GA,Lome=TG,Luanda=AO,Lubumbashi=ZR,Lusaka=ZM,Malabo=GQ,Maputo=MZ,Maseru=LS,Mbabane=SZ,Mogadishu=SO,Monrovia=LR,Nairobi=KE,Ndjamena=TD,Niamey=NE,Nouakchott=MR,Ouagadougou=HV,Porto-Novo=DY,Sao_Tome=ST,Timbuktu,Tripoli=LY,Tunis=TN,Windhoek=NA|America>Adak=US,Anchorage=US,Anguilla=AI,Antigua=AG,Araguaina=BR,Aruba=AW,Asuncion=PY,Atikokan,Atka,Bahia=BR,Bahia_Banderas=MX,Barbados=BB,Belem=BR,Belize=BZ,Blanc-Sablon=CA,Boa_Vista=BR,Bogota=CO,Boise=US,Buenos_Aires=AR,Cambridge_Bay=CA,Campo_Grande=BR,Cancun=MX,Caracas=VE,Catamarca=AR,Cayenne=GF,Cayman=KY,Chicago=US,Chihuahua=MX,Ciudad_Juarez=MX,Coral_Harbour=CA,Cordoba=AR,Costa_Rica=CR,Coyhaique=CL,Creston=CA,Cuiaba=BR,Curacao=CW,Danmarkshavn=GL,Dawson=CA,Dawson_Creek=CA,Denver=US,Detroit=US,Dominica=DM,Edmonton=CA,Eirunepe=BR,El_Salvador=SV,Ensenada,Fort_Nelson=CA,Fort_Wayne,Fortaleza=BR,Glace_Bay=CA,Godthab=GL,Goose_Bay=CA,Grand_Turk=TC,Grenada=GD,Guadeloupe=GP,Guatemala=GT,Guayaquil=EC,Guyana=GY,Halifax=CA,Havana=CU,Hermosillo=MX,Indianapolis=US,Inuvik=CA,Iqaluit=CA,Jamaica=JM,Jujuy=AR,Juneau=US,Knox_IN,Kralendijk=BQ,La_Paz=BO,Lima=PE,Los_Angeles=US,Louisville=US,Lower_Princes=SX,Maceio=BR,Managua=NI,Manaus=BR,Marigot=MF,Martinique=MQ,Matamoros=MX,Mazatlan=MX,Mendoza=AR,Menominee=US,Merida=MX,Metlakatla=US,Mexico_City=MX,Miquelon=PM,Moncton=CA,Monterrey=MX,Montevideo=UY,Montreal,Montserrat=MS,Nassau=BS,New_York=US,Nipigon,Nome=US,Noronha=BR,Nuuk,Ojinaga=MX,Panama=PZ,Pangnirtung,Paramaribo=SR,Phoenix=US,Port-au-Prince=HT,Port_of_Spain=TT,Porto_Acre,Porto_Velho=BR,Puerto_Rico=PR,Punta_Arenas=CL,Rainy_River,Rankin_Inlet=CA,Recife=BR,Regina=CA,Resolute=CA,Rio_Branco=BR,Rosario,Santa_Isabel,Santarem=BR,Santiago=CL,Santo_Domingo=DO,Sao_Paulo=BR,Scoresbysund=GL,Shiprock,Sitka=US,St_Barthelemy=BL,St_Johns=CA,St_Kitts=KN,St_Lucia=LC,St_Thomas=VI,St_Vincent=VC,Swift_Current=CA,Tegucigalpa=HN,Thule=GL,Thunder_Bay,Tijuana=MX,Toronto=CA,Tortola=VG,Vancouver=CA,Virgin,Whitehorse=CA,Winnipeg=CA,Yakutat=US,Yellowknife|America/Argentina>Buenos_Aires,Catamarca,ComodRivadavia,Cordoba,Jujuy,La_Rioja=AR,Mendoza,Rio_Gallegos=AR,Salta=AR,San_Juan=AR,San_Luis=AR,Tucuman=AR,Ushuaia=AR|America/Indiana>Indianapolis,Knox=US,Marengo=US,Petersburg=US,Tell_City=US,Vevay=US,Vincennes=US,Winamac=US|America/Kentucky>Louisville,Monticello=US|America/North_Dakota>Beulah=US,Center=US,New_Salem=US|Antarctica>Casey=NQ,Davis=NQ,DumontDUrville=NQ,Macquarie=AU,Mawson=NQ,McMurdo=NQ,Palmer=NQ,Rothera=NQ,South_Pole,Syowa=NQ,Troll=NQ,Vostok=NQ|Arctic>Longyearbyen=SJ|Asia>Aden=YE,Almaty=KZ,Amman=JO,Anadyr=SU,Aqtau=KZ,Aqtobe=KZ,Ashgabat=TM,Ashkhabad,Atyrau=KZ,Baghdad=IQ,Bahrain=BH,Baku=AZ,Bangkok=TH,Barnaul=SU,Beirut=LB,Bishkek=KG,Brunei=BN,Calcutta=IN,Chita=SU,Choibalsan,Chongqing,Chungking,Colombo=LK,Dacca,Damascus=SY,Dhaka=BD,Dili=TP,Dubai=AE,Dushanbe=TJ,Famagusta=CY,Gaza=PS,Harbin,Hebron=PS,Ho_Chi_Minh,Hong_Kong=HK,Hovd=MN,Irkutsk=SU,Istanbul,Jakarta=ID,Jayapura=ID,Jerusalem=IL,Kabul=AF,Kamchatka=SU,Karachi=PK,Kashgar,Kathmandu,Katmandu=NP,Khandyga=SU,Kolkata,Krasnoyarsk=SU,Kuala_Lumpur=MY,Kuching=MY,Kuwait=KW,Macao,Macau=MO,Magadan=SU,Makassar=ID,Manila=PH,Muscat=OM,Nicosia=CY,Novokuznetsk=SU,Novosibirsk=SU,Omsk=SU,Oral=KZ,Phnom_Penh=KH,Pontianak=ID,Pyongyang=KP,Qatar=QA,Qostanay=KZ,Qyzylorda=KZ,Rangoon=MM,Riyadh=SA,Saigon=VN,Sakhalin=SU,Samarkand=UZ,Seoul=KR,Shanghai=CN,Singapore=SG,Srednekolymsk=SU,Taipei=TW,Tashkent=UZ,Tbilisi=GE,Tehran=IR,Tel_Aviv,Thimbu,Thimphu=BT,Tokyo=JP,Tomsk=SU,Ujung_Pandang,Ulaanbaatar=MN,Ulan_Bator,Urumqi=CN,Ust-Nera=SU,Vientiane=LA,Vladivostok=SU,Yakutsk=SU,Yangon,Yekaterinburg=SU,Yerevan=AM|Atlantic>Azores=PT,Bermuda=BM,Canary=ES,Cape_Verde=CV,Faeroe=FO,Faroe,Jan_Mayen,Madeira=PT,Reykjavik=IS,South_Georgia=GS,St_Helena=SH,Stanley=FK|Australia>ACT,Adelaide=AU,Brisbane=AU,Broken_Hill=AU,Canberra,Currie,Darwin=AU,Eucla=AU,Hobart=AU,LHI,Lindeman=AU,Lord_Howe=AU,Melbourne=AU,NSW,North,Perth=AU,Queensland,South,Sydney=AU,Tasmania,Victoria,West,Yancowinna|Brazil>Acre,DeNoronha,East,West|>CET,CST6CDT,Cuba,EET,EST,EST5EDT,Egypt,Eire,GB,GB-Eire,GMT,GMT+0,GMT-0,GMT0,Greenwich,HST,Hongkong,Iceland,Iran,Israel,Jamaica,Japan,Kwajalein,Libya,MET,MST,MST7MDT,NZ,NZ-CHAT,Navajo,PRC,PST8PDT,Poland,Portugal,ROC,ROK,Singapore,Turkey,UCT,UTC,Universal,W-SU,WET,Zulu|Canada>Atlantic,Central,Eastern,Mountain,Newfoundland,Pacific,Saskatchewan,Yukon|Chile>Continental,EasterIsland|Etc>GMT,GMT+0,GMT+1,GMT+10,GMT+11,GMT+12,GMT+2,GMT+3,GMT+4,GMT+5,GMT+6,GMT+7,GMT+8,GMT+9,GMT-0,GMT-1,GMT-10,GMT-11,GMT-12,GMT-13,GMT-14,GMT-2,GMT-3,GMT-4,GMT-5,GMT-6,GMT-7,GMT-8,GMT-9,GMT0,Greenwich,UCT,UTC,Universal,Zulu|Europe>Amsterdam=NL,Andorra=AD,Astrakhan=SU,Athens=GR,Belfast,Belgrade=YU,Berlin=DE,Bratislava=SK,Brussels=BE,Bucharest=RO,Budapest=HU,Busingen=DE,Chisinau=MD,Copenhagen=DK,Dublin=IE,Gibraltar=GI,Guernsey=GG,Helsinki=FI,Isle_of_Man=IM,Istanbul=TR,Jersey=JE,Kaliningrad=SU,Kiev=UA,Kirov=SU,Kyiv,Lisbon=PT,Ljubljana=SI,London=UK,Luxembourg=LU,Madrid=ES,Malta=MT,Mariehamn=AX,Minsk=BY,Monaco=MC,Moscow=SU,Nicosia,Oslo=NO,Paris=FX,Podgorica=ME,Prague=CZ,Riga=LV,Rome=IT,Samara=SU,San_Marino=SM,Sarajevo=BA,Saratov=SU,Simferopol=UA,Skopje=MK,Sofia=BG,Stockholm=SE,Tallinn=EE,Tirane=AL,Tiraspol,Ulyanovsk=SU,Uzhgorod,Vaduz=LI,Vatican=VA,Vienna=AT,Vilnius=LT,Volgograd=SU,Warsaw=PL,Zagreb=HR,Zaporozhye,Zurich=CH|Indian>Antananarivo=MG,Chagos=IO,Christmas=CX,Cocos=CC,Comoro=KM,Kerguelen=TF,Mahe=SC,Maldives=MV,Mauritius=MU,Mayotte=YT,Reunion=RE|Mexico>BajaNorte,BajaSur,General|Pacific>Apia=WS,Auckland=NZ,Bougainville=PG,Chatham=NZ,Chuuk,Easter=CL,Efate=VU,Enderbury=KI,Fakaofo=TK,Fiji=FJ,Funafuti=TV,Galapagos=EC,Gambier=PF,Guadalcanal=SB,Guam=GU,Honolulu=US,Johnston,Kanton,Kiritimati=KI,Kosrae=PC,Kwajalein=MH,Majuro=MH,Marquesas=PF,Midway=WK,Nauru=NR,Niue=NU,Norfolk=NF,Noumea=NC,Pago_Pago=AS,Palau=PW,Pitcairn=PN,Pohnpei,Ponape=PC,Port_Moresby=PG,Rarotonga=CK,Saipan=MP,Samoa,Tahiti=PF,Tarawa=KI,Tongatapu=TO,Truk=PC,Wake=WK,Wallis=WF,Yap|US>Alaska,Aleutian,Arizona,Central,East-Indiana,Eastern,Hawaii,Indiana-Starke,Michigan,Mountain,Pacific,Samoa', '|');
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i], j = g.indexOf('>'), area = g.slice(0, j), list = I$splitStr(g.slice(j + 1), ',');
    for (let k = 0; k < list.length; k++) {
      const e = list[k], eq = e.indexOf('='), name = (area ? area + '/' : '') + (eq === -1 ? e : e.slice(0, eq));
      I$push(names, name);
      lower[I$asciiLower(name)] = name;
      if (eq !== -1) region[name] = e.slice(eq + 1);
    }
  }
  return { names, lower, region };
});
const I$timeZonesForRegion = r => {
  const d = I$zoneData(), out = [];
  for (let i = 0; i < d.names.length; i++) if (d.region[d.names[i]] === r) I$push(out, d.names[i]);
  return I$sortStrings(out);
};
I$install(I$Locale.prototype, {
  maximize() { return I$likelyLocale(I$thisSlots(this, I$LOCALE_BRAND), false); },
  minimize() { return I$likelyLocale(I$thisSlots(this, I$LOCALE_BRAND), true); },
  toString() { return I$thisSlots(this, I$LOCALE_BRAND).locale; },
  get baseName() { return I$langIdString(I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale)); },
  get calendar() { return I$thisSlots(this, I$LOCALE_BRAND).ca; },
  get caseFirst() { return I$thisSlots(this, I$LOCALE_BRAND).kf; },
  get collation() { return I$thisSlots(this, I$LOCALE_BRAND).co; },
  get firstDayOfWeek() { return I$thisSlots(this, I$LOCALE_BRAND).fw; },
  get hourCycle() { return I$thisSlots(this, I$LOCALE_BRAND).hc; },
  get numeric() {
    const kn = I$thisSlots(this, I$LOCALE_BRAND).kn;
    return kn === 'true' || kn === '';
  },
  get numberingSystem() { return I$thisSlots(this, I$LOCALE_BRAND).nu; },
  get language() { return I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale).lang; },
  get script() {
    const r = I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale);
    return r.script ? I$titleCase(r.script) : undefined;
  },
  get region() {
    const r = I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale);
    return r.region ? I$asciiUpper(r.region) : undefined;
  },
  get variants() {
    const r = I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale);
    return r.variants.length ? I$join(r.variants, '-') : undefined;
  },
  getCalendars() {
    const s = I$thisSlots(this, I$LOCALE_BRAND);
    return I$createArray([ s.ca !== undefined && s.ca !== '' ? s.ca : 'gregory' ]);
  },
  getCollations() {
    const s = I$thisSlots(this, I$LOCALE_BRAND);
    return I$createArray([ s.co !== undefined && s.co !== '' ? s.co : 'emoji' ]);
  },
  getHourCycles() {
    const s = I$thisSlots(this, I$LOCALE_BRAND);
    if (s.hc !== undefined && s.hc !== '') return I$createArray([ s.hc ]);
    return I$createArray([ I$REGION_HOUR12[I$localeRegionOrLikely(s)] !== undefined ? 'h12' : 'h23' ]);
  },
  getNumberingSystems() {
    const s = I$thisSlots(this, I$LOCALE_BRAND);
    return I$createArray([ s.nu !== undefined && s.nu !== '' ? s.nu : 'latn' ]);
  },
  getTimeZones() {
    const r = I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale);
    if (!r.region) return undefined;
    return I$createArray(I$timeZonesForRegion(I$asciiUpper(r.region)));
  },
  getTextInfo() {
    const r = I$parseTag(I$thisSlots(this, I$LOCALE_BRAND).locale);
    return { direction: I$RTL_SCRIPTS[I$addLikely(r.lang, r.script, r.region)[1]] !== undefined ? 'rtl' : 'ltr' };
  },
  getWeekInfo() {
    const s = I$thisSlots(this, I$LOCALE_BRAND);
    const days = [ 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' ];
    let first = s.fw !== undefined ? I$indexOf(days, s.fw) + 1 : 0;
    if (first === 0) first = I$REGION_SUNDAY[I$localeRegionOrLikely(s)] !== undefined ? 7 : 1;
    return { firstDay: first, weekend: I$createArray([ 6, 7 ]) };
  }
});
I$makeCtorProps(I$Locale, 1, 'Intl.Locale');
const I$timeZoneList = () => {
  const d = I$zoneData(), out = [];
  for (let i = 0; i < d.names.length; i++) {
    const n = d.names[i];
    // primary identifiers: CLDR zones, UTC and fixed-offset Etc/GMT
    if (d.region[n] !== undefined || n === 'UTC' || (n.slice(0, 7) === 'Etc/GMT' && n.length > 8)) I$push(out, n);
  }
  return out;
};
const I$currencyData = I$lazy(() => {
  const o = I$objCreate(null), rows = I$splitStr('AED|||UAE dirham|UAE dirhams;AFN||\u060b|Afghan Afghani|Afghan Afghanis;ALL|||Albanian lek|Albanian lek\u00eb;AMD||\u058f|Armenian dram|Armenian drams;ANG|||Netherlands Antillean guilder|Netherlands Antillean guilders;AOA||Kz|Angolan kwanza|Angolan kwanzas;ARS||$|Argentine peso|Argentine pesos;AUD|A$|$|Australian dollar|Australian dollars;AWG|||Aruban florin|;AZN||\u20bc|Azerbaijani manat|Azerbaijani manats;BAM||KM|Bosnia-Herzegovina convertible mark|Bosnia-Herzegovina convertible marks;BBD||$|Barbadian dollar|Barbadian dollars;BDT||\u09f3|Bangladeshi taka|Bangladeshi takas;BGN|||Bulgarian lev|Bulgarian leva;BHD|||Bahraini dinar|Bahraini dinars;BIF|||Burundian franc|Burundian francs;BMD||$|Bermudan dollar|Bermudan dollars;BND||$|Brunei dollar|Brunei dollars;BOB||Bs|Bolivian boliviano|Bolivian bolivianos;BRL|R$||Brazilian real|Brazilian reals;BSD||$|Bahamian dollar|Bahamian dollars;BTN|||Bhutanese ngultrum|Bhutanese ngultrums;BWP||P|Botswanan pula|Botswanan pulas;BYN|||Belarusian ruble|Belarusian rubles;BZD||$|Belize dollar|Belize dollars;CAD|CA$|$|Canadian dollar|Canadian dollars;CDF|||Congolese franc|Congolese francs;CHF|||Swiss franc|Swiss francs;CLP||$|Chilean peso|Chilean pesos;CNY|CN\u00a5|\u00a5|Chinese yuan|;COP||$|Colombian peso|Colombian pesos;CRC||\u20a1|Costa Rican col\u00f3n|Costa Rican col\u00f3ns;CUC||$|Cuban convertible peso|Cuban convertible pesos;CUP||$|Cuban peso|Cuban pesos;CVE|||Cape Verdean escudo|Cape Verdean escudos;CZK||K\u010d|Czech koruna|Czech korunas;DJF|||Djiboutian franc|Djiboutian francs;DKK||kr|Danish krone|Danish kroner;DOP||$|Dominican peso|Dominican pesos;DZD|||Algerian dinar|Algerian dinars;EGP||E\u00a3|Egyptian pound|Egyptian pounds;ERN|||Eritrean nakfa|Eritrean nakfas;ETB|||Ethiopian birr|Ethiopian birrs;EUR|\u20ac||euro|euros;FJD||$|Fijian dollar|Fijian dollars;FKP||\u00a3|Falkland Islands pound|Falkland Islands pounds;GBP|\u00a3||British pound|British pounds;GEL||\u20be|Georgian lari|Georgian laris;GHS||GH\u20b5|Ghanaian cedi|Ghanaian cedis;GIP||\u00a3|Gibraltar pound|Gibraltar pounds;GMD|||Gambian dalasi|Gambian dalasis;GNF||FG|Guinean franc|Guinean francs;GTQ||Q|Guatemalan quetzal|Guatemalan quetzals;GYD||$|Guyanaese dollar|Guyanaese dollars;HKD|HK$|$|Hong Kong dollar|Hong Kong dollars;HNL||L|Honduran lempira|Honduran lempiras;HRK||kn|Croatian kuna|Croatian kunas;HTG|||Haitian gourde|Haitian gourdes;HUF||Ft|Hungarian forint|Hungarian forints;IDR||Rp|Indonesian rupiah|Indonesian rupiahs;ILS|\u20aa||Israeli new shekel|Israeli new shekels;INR|\u20b9||Indian rupee|Indian rupees;IQD|||Iraqi dinar|Iraqi dinars;IRR|||Iranian rial|Iranian rials;ISK||kr|Icelandic kr\u00f3na|Icelandic kr\u00f3nur;JMD||$|Jamaican dollar|Jamaican dollars;JOD|||Jordanian dinar|Jordanian dinars;JPY|\u00a5||Japanese yen|;KES|||Kenyan shilling|Kenyan shillings;KGS||\u20c0|Kyrgystani som|Kyrgystani soms;KHR||\u17db|Cambodian riel|Cambodian riels;KMF||CF|Comorian franc|Comorian francs;KPW||\u20a9|North Korean won|;KRW|\u20a9||South Korean won|;KWD|||Kuwaiti dinar|Kuwaiti dinars;KYD||$|Cayman Islands dollar|Cayman Islands dollars;KZT||\u20b8|Kazakhstani tenge|Kazakhstani tenges;LAK||\u20ad|Laotian kip|Laotian kips;LBP||L\u00a3|Lebanese pound|Lebanese pounds;LKR||Rs|Sri Lankan rupee|Sri Lankan rupees;LRD||$|Liberian dollar|Liberian dollars;LSL|||Lesotho loti|Lesotho lotis;LYD|||Libyan dinar|Libyan dinars;MAD|||Moroccan dirham|Moroccan dirhams;MDL|||Moldovan leu|Moldovan lei;MGA||Ar|Malagasy ariary|Malagasy ariaries;MKD|||Macedonian denar|Macedonian denari;MMK||K|Myanmar kyat|Myanmar kyats;MNT||\u20ae|Mongolian tugrik|Mongolian tugriks;MOP|||Macanese pataca|Macanese patacas;MRU|||Mauritanian ouguiya|Mauritanian ouguiyas;MUR||Rs|Mauritian rupee|Mauritian rupees;MVR|||Maldivian rufiyaa|Maldivian rufiyaas;MWK|||Malawian kwacha|Malawian kwachas;MXN|MX$|$|Mexican peso|Mexican pesos;MYR||RM|Malaysian ringgit|Malaysian ringgits;MZN|||Mozambican metical|Mozambican meticals;NAD||$|Namibian dollar|Namibian dollars;NGN||\u20a6|Nigerian naira|Nigerian nairas;NIO||C$|Nicaraguan c\u00f3rdoba|Nicaraguan c\u00f3rdobas;NOK||kr|Norwegian krone|Norwegian kroner;NPR||Rs|Nepalese rupee|Nepalese rupees;NZD|NZ$|$|New Zealand dollar|New Zealand dollars;OMR|||Omani rial|Omani rials;PAB|||Panamanian balboa|Panamanian balboas;PEN|||Peruvian sol|Peruvian soles;PGK|||Papua New Guinean kina|;PHP|\u20b1||Philippine peso|Philippine pesos;PKR||Rs|Pakistani rupee|Pakistani rupees;PLN||z\u0142|Polish zloty|Polish zlotys;PYG||\u20b2|Paraguayan guarani|Paraguayan guaranis;QAR|||Qatari riyal|Qatari riyals;RON||lei|Romanian leu|Romanian lei;RSD|||Serbian dinar|Serbian dinars;RUB||\u20bd|Russian ruble|Russian rubles;RWF||RF|Rwandan franc|Rwandan francs;SAR|||Saudi riyal|Saudi riyals;SBD||$|Solomon Islands dollar|Solomon Islands dollars;SCR|||Seychellois rupee|Seychellois rupees;SDG|||Sudanese pound|Sudanese pounds;SEK||kr|Swedish krona|Swedish kronor;SGD||$|Singapore dollar|Singapore dollars;SHP||\u00a3|St. Helena pound|St. Helena pounds;SLE|||Sierra Leonean leone|Sierra Leonean leones;SLL|||Sierra Leonean leone (1964\u20142022)|Sierra Leonean leones (1964\u20142022);SOS|||Somali shilling|Somali shillings;SRD||$|Surinamese dollar|Surinamese dollars;SSP||\u00a3|South Sudanese pound|South Sudanese pounds;STN||Db|S\u00e3o Tom\u00e9 & Pr\u00edncipe dobra|S\u00e3o Tom\u00e9 & Pr\u00edncipe dobras;SVC|||Salvadoran col\u00f3n|Salvadoran colones;SYP||\u00a3|Syrian pound|Syrian pounds;SZL|||Swazi lilangeni|Swazi emalangeni;THB||\u0e3f|Thai baht|;TJS|||Tajikistani somoni|Tajikistani somonis;TMT|||Turkmenistani manat|;TND|||Tunisian dinar|Tunisian dinars;TOP||T$|Tongan pa\u02bbanga|;TRY||\u20ba|Turkish lira|Turkish Lira;TTD||$|Trinidad & Tobago dollar|Trinidad & Tobago dollars;TWD|NT$|$|New Taiwan dollar|New Taiwan dollars;TZS|||Tanzanian shilling|Tanzanian shillings;UAH||\u20b4|Ukrainian hryvnia|Ukrainian hryvnias;UGX|||Ugandan shilling|Ugandan shillings;USD|$||US dollar|US dollars;UYU||$|Uruguayan peso|Uruguayan pesos;UZS|||Uzbekistani som|;VES|||Venezuelan bol\u00edvar|Venezuelan bol\u00edvars;VND|\u20ab||Vietnamese dong|;VUV|||Vanuatu vatu|Vanuatu vatus;WST|||Samoan tala|;XAF|FCFA||Central African CFA franc|Central African CFA francs;XCD|EC$|$|East Caribbean dollar|East Caribbean dollars;XCG|Cg.||Caribbean guilder|Caribbean guilders;XDR|||special drawing rights|;XOF|F\u202fCFA||West African CFA franc|West African CFA francs;XPF|CFPF||CFP franc|CFP francs;XSU|||Sucre|Sucres;YER|||Yemeni rial|Yemeni rials;ZAR||R|South African rand|;ZMW||ZK|Zambian kwacha|Zambian kwachas;ZWG|||Zimbabwean gold|;ZWL|||Zimbabwean dollar (2009\u20132024)|Zimbabwean dollars (2009\u20132024)', ';');
  for (let i = 0; i < rows.length; i++) {
    const r = I$splitStr(rows[i], '|');
    o[r[0]] = r;
  }
  return o;
});
const I$currencyList = () => {
  const out = [], d = I$currencyData();
  for (const k in d) I$push(out, k);
  return out;
};
const I$supportedValues = key => {
  if (key === 'calendar') return I$CALENDARS;
  if (key === 'collation') return I$COLLATIONS;
  if (key === 'currency') return I$currencyList();
  if (key === 'numberingSystem') return I$numberingSystems();
  if (key === 'timeZone') return I$timeZoneList();
  if (key === 'unit') return I$UNITS;
  throw new RangeError('Invalid key : ' + key);
};
I$install(Intl, {
  getCanonicalLocales(locales) { return I$createArray(I$canonicalizeLocaleList(locales)); },
  supportedValuesOf(key) {
    key = I$toStr(key);
    const list = I$supportedValues(key), out = [];
    for (let i = 0; i < list.length; i++) I$push(out, list[i]);
    return I$createArray(I$sortStrings(out));
  }
});
I$setTag(Intl, 'Intl');
I$defProp(Intl, 'Locale', { value: I$Locale, writable: true, enumerable: false, configurable: true });
const I$defineService = (C, len, name, proto) => {
  I$install(C, {
    supportedLocalesOf(locales) { return I$supportedLocales(I$canonicalizeLocaleList(locales), arguments[1]); }
  });
  I$install(C.prototype, proto);
  I$makeCtorProps(C, len, 'Intl.' + name);
  I$defProp(Intl, name, { value: C, writable: true, enumerable: false, configurable: true });
};

const I$fallbackSymbol = Symbol('IntlLegacyConstructedSymbol');
const I$legacyConstruct = (C, newTarget, thisArg, brand, o) => {
  const x = newTarget === undefined ? I$objCreate(C.prototype) : thisArg;
  I$setSlots(x, brand, o);
  if (newTarget === undefined && I$ordinaryHasInstance(C, thisArg)) {
    I$defProp(thisArg, I$fallbackSymbol, { value: x, writable: false, enumerable: false, configurable: false });
    return thisArg;
  }
  return x;
};
const I$unwrapLegacy = (x, C, brand) => {
  let s = I$slotsOf(x, brand);
  if (s === undefined && I$ordinaryHasInstance(C, x)) s = I$slotsOf(x[I$fallbackSymbol], brand);
  if (s === undefined) throw new TypeError('Receiver is not ' + brand);
  return s;
};

// { neg, kind: 'n' | 'nan' | 'inf', d: digits without leading/trailing zeros, e } = 0.d * 10^e
const I$zeros = n => {
  let s = '';
  while (n-- > 0) s += '0';
  return s;
};
const I$makeDec = (neg, digits, e) => {
  let i = 0;
  while (i < digits.length && digits.charCodeAt(i) === 48) {
    i++;
    e--;
  }
  let j = digits.length;
  while (j > i && digits.charCodeAt(j - 1) === 48) j--;
  if (i !== 0 || j !== digits.length) digits = digits.slice(i, j);
  if (digits === '') e = 0;
  return { neg, kind: 'n', d: digits, e };
};
const I$parseDecimalLiteral = s => {
  let n = s.length, i = 0, neg = false, c = s.charCodeAt(0);
  if (c === 43 || c === 45) {
    neg = c === 45;
    i++;
  }
  const intStart = i;
  while (i < n && I$isDigitC(s.charCodeAt(i))) i++;
  let intPart = s.slice(intStart, i), frac = '', exp = 0;
  if (i < n && s.charCodeAt(i) === 46) {
    const fracStart = ++i;
    while (i < n && I$isDigitC(s.charCodeAt(i))) i++;
    frac = s.slice(fracStart, i);
  }
  if (intPart === '' && frac === '') return null;
  c = i < n ? s.charCodeAt(i) : 0;
  if (c === 101 || c === 69) {
    i++;
    let eneg = false;
    c = i < n ? s.charCodeAt(i) : 0;
    if (c === 43 || c === 45) {
      eneg = c === 45;
      i++;
    }
    const expStart = i;
    while (i < n && I$isDigitC(s.charCodeAt(i))) i++;
    if (i === expStart) return null;
    exp = +s.slice(expStart, i);
    if (eneg) exp = -exp;
  }
  if (i !== n) return null;
  return I$makeDec(neg, intPart + frac, intPart.length + exp);
};
const I$addSmall = (s, n) => {
  let out = '', carry = n, i = s.length - 1;
  while (i >= 0 || carry > 0) {
    const d = (i >= 0 ? s.charCodeAt(i) - 48 : 0) + carry;
    out = String.fromCharCode(48 + d % 10) + out;
    carry = Math.floor(d / 10);
    i--;
  }
  return (i >= 0 ? s.slice(0, i + 1) : '') + out;
};
const I$subSmall = (s, n) => {
  let out = '', borrow = n, i = s.length - 1;
  while (i >= 0 && borrow > 0) {
    let d = (s.charCodeAt(i) - 48) - borrow % 10;
    borrow = Math.floor(borrow / 10);
    if (d < 0) {
      d += 10;
      borrow++;
    }
    out = String.fromCharCode(48 + d) + out;
    i--;
  }
  return s.slice(0, i + 1) + out;
};
const I$lastDigits = (s, n) => {
  const t = s.slice(s.length > n ? s.length - n : 0);
  return t === '' ? 0 : +t;
};
// inc is 1, 2, 5 or 25 and mode is an unsigned rounding mode
const I$roundDec = (x, m, inc, mode) => {
  let k = x.e - m, D = x.d, q, rest;
  if (k <= 0) {
    q = '';
    rest = I$zeros(-k) + D;
  } else if (k >= D.length) {
    q = D + I$zeros(k - D.length);
    rest = '';
  } else {
    q = D.slice(0, k);
    rest = D.slice(k);
  }
  let restNZ = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest.charCodeAt(i) !== 48) {
      restNZ = true;
      break;
    }
  }
  const mod = I$lastDigits(q, 2) % inc;
  let low = mod ? I$subSmall(q, mod) : q, res;
  if (mod === 0 && !restNZ) res = low;
  else {
    let t = 2 * mod, rel;
    if (!restNZ) rel = t < inc ? -1 : (t === inc ? 0 : 1);
    else {
      let r0 = rest.charCodeAt(0), halfExact = r0 === 53;
      if (halfExact) {
        for (let i = 1; i < rest.length; i++) {
          if (rest.charCodeAt(i) !== 48) {
            halfExact = false;
            break;
          }
        }
      }
      if (halfExact) rel = t + 1 < inc ? -1 : (t + 1 === inc ? 0 : 1);
      else if (r0 < 53) rel = t + 1 <= inc ? -1 : 1;
      else rel = t + 2 <= inc ? -1 : 1;
    }
    let up;
    if (mode === 'zero') up = false;
    else if (mode === 'infinity') up = true;
    else if (rel !== 0) up = rel > 0;
    else if (mode === 'half-zero') up = false;
    else if (mode === 'half-infinity') up = true;
    else up = Math.floor(I$lastDigits(low, 3) / inc) % 2 === 1;
    res = up ? I$addSmall(low, inc) : low;
  }
  return I$makeDec(x.neg, res, res.length + m);
};
const I$decFromNumber = x => {
  if (x !== x) return { neg: false, kind: 'nan', d: '', e: 0 };
  const neg = x < 0 || (x === 0 && 1 / x < 0);
  if (x === Infinity || x === -Infinity) return { neg, kind: 'inf', d: '', e: 0 };
  if (x === 0) return { neg, kind: 'n', d: '', e: 0 };
  const a = neg ? -x : x;
  let r = I$parseDecimalLiteral(String(a));
  if (a >= 9007199254740992 && a < 1e21) {
    for (let p = 1; p <= 17; p++) {
      const c = I$roundDec(r, r.e - p, 1, 'half-even');
      if (+('0.' + c.d + 'e' + c.e) === a) {
        r = c;
        break;
      }
    }
  }
  r.neg = neg;
  return r;
};
const I$isWS = c => c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 32 || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
const I$mulStr = (s, k) => {
  if (k === 0 || s === '0') return '0';
  let out = '', carry = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = (s.charCodeAt(i) - 48) * k + carry;
    out = String.fromCharCode(48 + v % 10) + out;
    carry = Math.floor(v / 10);
  }
  while (carry > 0) {
    out = String.fromCharCode(48 + carry % 10) + out;
    carry = Math.floor(carry / 10);
  }
  return out;
};
const I$addStr = (a, b) => {
  let out = '', carry = 0, i = a.length - 1, j = b.length - 1;
  while (i >= 0 || j >= 0 || carry) {
    const v = (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0) + carry;
    out = String.fromCharCode(48 + v % 10) + out;
    carry = v >= 10 ? 1 : 0;
  }
  return out;
};
const I$decFromString = s => {
  let a = 0, b = s.length;
  while (a < b && I$isWS(s.charCodeAt(a))) a++;
  while (b > a && I$isWS(s.charCodeAt(b - 1))) b--;
  s = s.slice(a, b);
  if (s === '') return I$makeDec(false, '', 0);
  if (s === 'Infinity' || s === '+Infinity') return { neg: false, kind: 'inf', d: '', e: 0 };
  if (s === '-Infinity') return { neg: true, kind: 'inf', d: '', e: 0 };
  const p = s.slice(0, 2);
  if (p === '0x' || p === '0X' || p === '0o' || p === '0O' || p === '0b' || p === '0B') {
    const n = Number(s);
    if (n !== n) return I$decFromNumber(NaN);
    let radix = p[1] === 'x' || p[1] === 'X' ? 16 : p[1] === 'o' || p[1] === 'O' ? 8 : 2, acc = '0';
    for (let k = 2; k < s.length; k++) acc = I$addStr(I$mulStr(acc, radix), String(parseInt(s[k], 16)));
    return I$parseDecimalLiteral(acc);
  }
  const r = I$parseDecimalLiteral(s);
  return r === null ? I$decFromNumber(NaN) : r;
};
const I$toIntlMV = value => {
  const prim = I$isObj(value) ? I$toPrimitive(value, 'number') : value;
  if (typeof prim === 'bigint') {
    const s = prim.toString();
    return s[0] === '-' ? I$makeDec(true, s.slice(1), s.length - 1) : I$makeDec(false, s, s.length);
  }
  if (typeof prim === 'string') return I$decFromString(prim);
  return I$decFromNumber(I$toNum(prim));
};
const I$decIsZero = x => x.kind === 'n' && x.d === '';
const I$decToNumber = x => {
  if (x.kind === 'nan') return NaN;
  if (x.kind === 'inf') return x.neg ? -Infinity : Infinity;
  const v = x.d === '' ? 0 : +('0.' + x.d + 'e' + x.e);
  return x.neg ? -v : v;
};
const I$decCmpAbs = (x, y) => {
  if (x.d === '' || y.d === '') return (x.d === '' ? 0 : 1) - (y.d === '' ? 0 : 1);
  if (x.e !== y.e) return x.e > y.e ? 1 : -1;
  return x.d === y.d ? 0 : (x.d > y.d ? 1 : -1);
};
const I$decCmp = (x, y) => {
  const sx = x.d === '' ? 0 : (x.neg ? -1 : 1), sy = y.d === '' ? 0 : (y.neg ? -1 : 1);
  if (sx !== sy) return sx > sy ? 1 : -1;
  const c = I$decCmpAbs(x, y);
  return sx < 0 ? -c : c;
};
const I$cmpStr = (a, b) => {
  while (a.length > 1 && a[0] === '0') a = a.slice(1);
  while (b.length > 1 && b[0] === '0') b = b.slice(1);
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : (a < b ? -1 : 1);
};
const I$intStr = x => {
  if (x < 0) x = -x;
  if (x < 9007199254740992) return String(x);
  // exact value: x = m * 2^k with an integral m below 2^53
  let e = Math.floor(Math.log2(x));
  if (Math.pow(2, e) > x) e--;
  else if (Math.pow(2, e + 1) <= x) e++;
  let k = e - 52, out = String(x / Math.pow(2, k));
  for (let i = 0; i < k; i++) out = I$mulStr(out, 2);
  return out;
};
const I$unsignedRoundingMode = (mode, neg) => {
  if (mode === 'ceil') return neg ? 'zero' : 'infinity';
  if (mode === 'floor') return neg ? 'infinity' : 'zero';
  if (mode === 'expand') return 'infinity';
  if (mode === 'trunc') return 'zero';
  if (mode === 'halfCeil') return neg ? 'half-zero' : 'half-infinity';
  if (mode === 'halfFloor') return neg ? 'half-infinity' : 'half-zero';
  if (mode === 'halfExpand') return 'half-infinity';
  if (mode === 'halfTrunc') return 'half-zero';
  return 'half-even';
};
const I$stripTrailing = (m, cut) => {
  if (m.indexOf('.') === -1) return m;
  let j = m.length;
  while (cut > 0 && m.charCodeAt(j - 1) === 48) {
    j--;
    cut--;
  }
  if (m.charCodeAt(j - 1) === 46) j--;
  return j === m.length ? m : m.slice(0, j);
};
const I$toRawPrecision = (x, minP, maxP, urm) => {
  let p = maxP, e, m, r;
  if (x.d === '') {
    m = I$zeros(p);
    e = 0;
    r = x;
  } else {
    e = x.e - 1;
    r = I$roundDec(x, e - p + 1, 1, urm);
    e = r.e - 1;
    m = r.d + I$zeros(p - r.d.length);
  }
  let int;
  if (e >= p - 1) {
    m = m + I$zeros(e - p + 1);
    int = e + 1;
  } else if (e >= 0) {
    m = m.slice(0, e + 1) + '.' + m.slice(e + 1);
    int = e + 1;
  } else {
    m = '0.' + I$zeros(-(e + 1)) + m;
    int = 1;
  }
  if (m.indexOf('.') !== -1 && maxP > minP) m = I$stripTrailing(m, maxP - minP);
  return { str: m, rounded: r, int, mag: e - p + 1 };
};
const I$toRawFixed = (x, minF, maxF, increment, urm) => {
  let f = maxF, inc = increment, mag = -f;
  while (inc % 10 === 0) {
    inc /= 10;
    mag++;
  }
  const r = I$roundDec(x, mag, inc, urm);
  const n = r.d === '' ? '0' : r.d + I$zeros(r.e + f - r.d.length);
  let m = n, int;
  if (f !== 0) {
    let k = m.length;
    if (k <= f) {
      m = I$zeros(f + 1 - k) + m;
      k = f + 1;
    }
    m = m.slice(0, k - f) + '.' + m.slice(k - f);
    int = k - f;
  } else int = m.length;
  m = I$stripTrailing(m, maxF - minF);
  return { str: m, rounded: r, int, mag: -f };
};
const I$formatNumericToString = (o, x) => {
  const neg = x.neg;
  const ax = I$makeDec(false, x.d, x.e);
  const urm = I$unsignedRoundingMode(o.roundingMode, neg);
  let res;
  if (o.roundingType === 'significantDigits') res = I$toRawPrecision(ax, o.minimumSignificantDigits, o.maximumSignificantDigits, urm);
  else if (o.roundingType === 'fractionDigits') res = I$toRawFixed(ax, o.minimumFractionDigits, o.maximumFractionDigits, o.roundingIncrement, urm);
  else {
    const sr = I$toRawPrecision(ax, o.minimumSignificantDigits, o.maximumSignificantDigits, urm);
    const fr = I$toRawFixed(ax, o.minimumFractionDigits, o.maximumFractionDigits, o.roundingIncrement, urm);
    const fixedMore = o.roundingType === 'morePrecision' ? !(sr.mag <= fr.mag) : sr.mag <= fr.mag;
    res = fixedMore ? fr : sr;
  }
  let r = res.rounded, s = res.str;
  if (o.trailingZeroDisplay === 'stripIfInteger' && (r.d === '' || r.e >= r.d.length)) {
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot);
  }
  if (res.int < o.minimumIntegerDigits) s = I$zeros(o.minimumIntegerDigits - res.int) + s;
  return { rounded: I$makeDec(neg, r.d, r.e), str: s };
};

const I$ISO_DIGITS = I$table('BIF:0,CLP:0,DJF:0,GNF:0,ISK:0,JPY:0,KMF:0,KRW:0,PYG:0,RWF:0,UGX:0,UYI:0,VND:0,VUV:0,XAF:0,XOF:0,XPF:0,BHD:3,IQD:3,JOD:3,KWD:3,LYD:3,OMR:3,TND:3,CLF:4,UYW:4');
const I$currencyDigits = c => {
  const d = I$ISO_DIGITS[c];
  return d === undefined ? 2 : +d;
};
// unit patterns per locale: loc>unit=short|narrow|long (one~other); # number, [x] unit text
const I$unitData = I$lazy(() => {
  const o = I$objCreate(null), locs = I$splitStr('en>acre=# [ac]|#[ac]|# [acre]~# [acres];bit=# [bit]|#[bit]|# [bit]~# [bits];byte=# [byte]|#[B]|# [byte]~# [bytes];celsius=#[\u00b0C]|#[\u00b0C]|# [degree Celsius]~# [degrees Celsius];centimeter=# [cm]|#[cm]|# [centimeter]~# [centimeters];day=# [day]~# [days]|#[d]|# [day]~# [days];degree=# [deg]|#[\u00b0]|# [degree]~# [degrees];fahrenheit=#[\u00b0F]|#[\u00b0]|# [degree Fahrenheit]~# [degrees Fahrenheit];fluid-ounce=# [fl oz]|#[fl oz]|# [fluid ounce]~# [fluid ounces];foot=# [ft]|#[\u2032]|# [foot]~# [feet];gallon=# [gal]|#[gal]|# [gallon]~# [gallons];gigabit=# [Gb]|#[Gb]|# [gigabit]~# [gigabits];gigabyte=# [GB]|#[GB]|# [gigabyte]~# [gigabytes];gram=# [g]|#[g]|# [gram]~# [grams];hectare=# [ha]|#[ha]|# [hectare]~# [hectares];hour=# [hr]|#[h]|# [hour]~# [hours];inch=# [in]|#[\u2033]|# [inch]~# [inches];kilobit=# [kb]|#[kb]|# [kilobit]~# [kilobits];kilobyte=# [kB]|#[kB]|# [kilobyte]~# [kilobytes];kilogram=# [kg]|#[kg]|# [kilogram]~# [kilograms];kilometer=# [km]|#[km]|# [kilometer]~# [kilometers];liter=# [L]|#[L]|# [liter]~# [liters];megabit=# [Mb]|#[Mb]|# [megabit]~# [megabits];megabyte=# [MB]|#[MB]|# [megabyte]~# [megabytes];meter=# [m]|#[m]|# [meter]~# [meters];microsecond=# [\u03bcs]|#[\u03bcs]|# [microsecond]~# [microseconds];mile=# [mi]|#[mi]|# [mile]~# [miles];mile-scandinavian=# [smi]|#[smi]|# [mile-scandinavian]~# [miles-scandinavian];milliliter=# [mL]|#[mL]|# [milliliter]~# [milliliters];millimeter=# [mm]|#[mm]|# [millimeter]~# [millimeters];millisecond=# [ms]|#[ms]|# [millisecond]~# [milliseconds];minute=# [min]|#[m]|# [minute]~# [minutes];month=# [mth]~# [mths]|#[m]|# [month]~# [months];nanosecond=# [ns]|#[ns]|# [nanosecond]~# [nanoseconds];ounce=# [oz]|#[oz]|# [ounce]~# [ounces];percent=#[%]|#[%]|# [percent];petabyte=# [PB]|#[PB]|# [petabyte]~# [petabytes];pound=# [lb]|#[#]|# [pound]~# [pounds];second=# [sec]|#[s]|# [second]~# [seconds];stone=# [st]|#[st]|# [stone]~# [stones];terabit=# [Tb]|#[Tb]|# [terabit]~# [terabits];terabyte=# [TB]|#[TB]|# [terabyte]~# [terabytes];week=# [wk]~# [wks]|#[w]|# [week]~# [weeks];yard=# [yd]|#[yd]|# [yard]~# [yards];year=# [yr]~# [yrs]|#[y]|# [year]~# [years];kilometer-per-hour=# [km/h]|#[km/h]|# [kilometer per hour]~# [kilometers per hour];mile-per-hour=# [mph]|#[mph]|# [mile per hour]~# [miles per hour];meter-per-second=# [m/s]|#[m/s]|# [meter per second]~# [meters per second];liter-per-kilometer=# [L/km]|#[L/km]|# [liter per kilometer]~# [liters per kilometer];mile-per-gallon=# [mpg]|#[mpg]|# [mile per gallon]~# [miles per gallon]^de>acre=# [ac]|# [ac]|# [Acre]~# [Acres];bit=#\u00a0[Bit]~# [Bit]|# [b]|#\u00a0[Bit]~# [Bit];byte=#\u00a0[Byte]~# [Byte]|# [B]|#\u00a0[Byte]~# [Byte];celsius=# [\u00b0C]|# [\u00b0C]|# [Grad Celsius];centimeter=# [cm]|# [cm]|# [Zentimeter];day=# [Tg.]|# [T]|# [Tag]~# [Tage];degree=#[\u00b0]|#[\u00b0]|# [Grad];fahrenheit=# [\u00b0F]|#[\u00b0F]|# [Grad Fahrenheit];fluid-ounce=# [fl oz]|# [fl oz]|#\u00a0[Fl\u00fcssigunze]~#\u00a0[Fl\u00fcssigunzen];foot=# [ft]|# [ft]|# [Fu\u00df];gallon=# [gal]|# [gal]|#\u00a0[Gallone]~#\u00a0[Gallonen];gigabit=#\u00a0[Gb]|#\u00a0[Gb]|#\u00a0[Gigabit]~# [Gigabit];gigabyte=#\u00a0[GB]|#\u00a0[GB]|#\u00a0[Gigabyte]~# [Gigabyte];gram=# [g]|# [g]|# [Gramm];hectare=# [ha]|# [ha]|# [Hektar];hour=# [Std.]|# [Std.]|# [Stunde]~# [Stunden];inch=#\u00a0[in]~# [in]|#\u00a0[in]~# [in]|# [Zoll];kilobit=# [kb]|# [kb]|#\u00a0[Kilobit]~# [Kilobit];kilobyte=# [kB]|# [kB]|#\u00a0[Kilobyte]~# [Kilobyte];kilogram=# [kg]|# [kg]|# [Kilogramm];kilometer=# [km]|# [km]|# [Kilometer];liter=# [l]|# [l]|# [Liter];megabit=# [Mb]|# [Mb]|#\u00a0[Megabit]~# [Megabit];megabyte=# [MB]|# [MB]|#\u00a0[Megabyte]~# [Megabyte];meter=# [m]|# [m]|# [Meter];microsecond=# [\u03bcs]|# [\u03bcs]|# [Mikrosekunde]~# [Mikrosekunden];mile=# [mi]|# [mi]|# [Meile]~# [Meilen];mile-scandinavian=# [smi]|#[smi]|# [skandinavische Meile]~# [skandinavische Meilen];milliliter=#\u00a0[ml]|#\u00a0[ml]|#\u00a0[Milliliter];millimeter=# [mm]|# [mm]|# [Millimeter];millisecond=# [ms]|# [ms]|# [Millisekunde]~# [Millisekunden];minute=# [Min.]|# [Min.]|# [Minute]~# [Minuten];month=# [Mon.]|# [M]|# [Monat]~# [Monate];nanosecond=# [ns]|# [ns]|# [Nanosekunde]~# [Nanosekunden];ounce=# [oz]|# [oz]|# [Unze]~# [Unzen];percent=#\u00a0[%]|#\u00a0[%]|# [Prozent];petabyte=# [PB]|# [PB]|# [Petabyte];pound=# [lb]|# [lb]|# [Pfund];second=# [Sek.]|# [Sek.]|# [Sekunde]~# [Sekunden];stone=# [st]|# [st]|#\u00a0[Stone]~#\u00a0[Stones];terabit=# [Tb]|# [Tb]|#\u00a0[Terabit]~# [Terabit];terabyte=# [TB]|# [TB]|#\u00a0[Terabyte]~# [Terabyte];week=# [Wo.]|# [W]|# [Woche]~# [Wochen];yard=# [yd]|# [yd]|# [Yard]~# [Yards];year=# [J]|# [J]|# [Jahr]~# [Jahre];kilometer-per-hour=# [km/h]|# [km/h]|# [Kilometer pro Stunde];mile-per-hour=# [mi/h]|# [mi/h]|# [Meile pro Stunde]~# [Meilen pro Stunde];meter-per-second=# [m/s]|# [m/s]|# [Meter pro Sekunde];liter-per-kilometer=#\u00a0[l/km]|#[l/km]|#\u00a0[Liter pro Kilometer];mile-per-gallon=# [mpg]|#[mpg]|#\u00a0[Meile pro Gallone]~#\u00a0[Meilen pro Gallone]^ja>acre=# [ac]|#[ac]|# [\u30a8\u30fc\u30ab\u30fc];bit=# [bit]|#[b]|# [\u30d3\u30c3\u30c8];byte=# [byte]|#[B]|# [\u30d0\u30a4\u30c8];celsius=#[\u00b0C]|#[\u00b0C]|[\u6442\u6c0f] # [\u5ea6];centimeter=# [cm]|#[cm]|# [\u30bb\u30f3\u30c1\u30e1\u30fc\u30c8\u30eb];day=# [\u65e5]|#[d]|# [\u65e5];degree=# [\u5ea6]|#[\u00b0]|# [\u5ea6];fahrenheit=#[\u00b0F]|#[\u00b0F]|[\u83ef\u6c0f] # [\u5ea6];fluid-ounce=# [fl oz]|#[fl oz]|# [\u6db2\u91cf\u30aa\u30f3\u30b9];foot=# [ft]|#[\u2032]|# [\u30d5\u30a3\u30fc\u30c8];gallon=# [gal]|#[gal]|# [\u30ac\u30ed\u30f3];gigabit=# [Gb]|#[Gb]|# [\u30ae\u30ac\u30d3\u30c3\u30c8];gigabyte=# [GB]|#[GB]|# [\u30ae\u30ac\u30d0\u30a4\u30c8];gram=# [g]|#[g]|# [\u30b0\u30e9\u30e0];hectare=# [ha]|#[ha]|# [\u30d8\u30af\u30bf\u30fc\u30eb];hour=# [\u6642\u9593]|#[h]|# [\u6642\u9593];inch=# [in]|#[\u2033]|# [\u30a4\u30f3\u30c1];kilobit=# [kb]|#[kb]|# [\u30ad\u30ed\u30d3\u30c3\u30c8];kilobyte=# [KB]|#[KB]|# [\u30ad\u30ed\u30d0\u30a4\u30c8];kilogram=# [kg]|#[kg]|# [\u30ad\u30ed\u30b0\u30e9\u30e0];kilometer=# [km]|#[km]|# [\u30ad\u30ed\u30e1\u30fc\u30c8\u30eb];liter=# [L]|#[L]|# [\u30ea\u30c3\u30c8\u30eb];megabit=# [Mb]|#[Mb]|# [\u30e1\u30ac\u30d3\u30c3\u30c8];megabyte=# [MB]|#[MB]|# [\u30e1\u30ac\u30d0\u30a4\u30c8];meter=# [m]|#[m]|# [\u30e1\u30fc\u30c8\u30eb];microsecond=# [\u03bcs]|#[\u03bcs]|# [\u30de\u30a4\u30af\u30ed\u79d2];mile=# [mi]|#[mi]|# [\u30de\u30a4\u30eb];mile-scandinavian=# [smi]|#[smi]|# [\u30b9\u30ab\u30f3\u30b8\u30ca\u30d3\u30a2\u30de\u30a4\u30eb];milliliter=# [ml]|#[ml]|# [\u30df\u30ea\u30ea\u30c3\u30c8\u30eb];millimeter=# [mm]|#[mm]|# [\u30df\u30ea\u30e1\u30fc\u30c8\u30eb];millisecond=# [ms]|#[ms]|# [\u30df\u30ea\u79d2];minute=# [\u5206]|#[m]|# [\u5206];month=# [\u304b\u6708]|#[m]|# [\u304b\u6708];nanosecond=# [ns]|#[ns]|# [\u30ca\u30ce\u79d2];ounce=# [oz]|#[oz]|# [\u30aa\u30f3\u30b9];percent=#[%]|#[%]|# [\u30d1\u30fc\u30bb\u30f3\u30c8];petabyte=# [PB]|#[PB]|# [\u30da\u30bf\u30d0\u30a4\u30c8];pound=# [lb]|#[lb]|# [\u30dd\u30f3\u30c9];second=# [\u79d2]|#[s]|# [\u79d2];stone=# [st]|#[st]|# [\u30b9\u30c8\u30fc\u30f3];terabit=# [Tb]|#[Tb]|# [\u30c6\u30e9\u30d3\u30c3\u30c8];terabyte=# [TB]|#[TB]|# [\u30c6\u30e9\u30d0\u30a4\u30c8];week=# [\u9031\u9593]|#[w]|# [\u9031\u9593];yard=# [yd]|#[yd]|# [\u30e4\u30fc\u30c9];year=# [\u5e74]|#[y]|# [\u5e74];kilometer-per-hour=# [km/h]|#[km/h]|[\u6642\u901f] # [\u30ad\u30ed\u30e1\u30fc\u30c8\u30eb];mile-per-hour=# [mph]|#[mi/h]|[\u6642\u901f] # [\u30de\u30a4\u30eb];meter-per-second=# [m/s]|#[m/s]|[\u79d2\u901f] # [\u30e1\u30fc\u30c8\u30eb];liter-per-kilometer=# [L/km]|#[L/km]|# [\u30ea\u30c3\u30c8\u30eb\u6bce\u30ad\u30ed\u30e1\u30fc\u30c8\u30eb];mile-per-gallon=# [mpg]|#[mpg]|# [\u30de\u30a4\u30eb\u6bce\u30ac\u30ed\u30f3]^ko>acre=#[ac]|#[ac]|#[\uc5d0\uc774\ucee4];bit=#[bit]|#[bit]|#[\ube44\ud2b8];byte=#[byte]|#[byte]|#[\ubc14\uc774\ud2b8];celsius=#[\u00b0C]|#[\u00b0C]|[\uc12d\uc528] #[\ub3c4];centimeter=#[cm]|#[cm]|#[\uc13c\ud2f0\ubbf8\ud130];day=#[\uc77c]|#[\uc77c]|#[\uc77c];degree=#[\u00b0]|#[\u00b0]|#[\ub3c4];fahrenheit=#[\u00b0F]|#[\u00b0F]|[\ud654\uc528] #[\ub3c4];fluid-ounce=#[fl oz]|#[fl oz]|#[\uc561\ub7c9 \uc628\uc2a4];foot=#[ft]|#[\u2032]|#[\ud53c\ud2b8];gallon=#[gal]|#[gal]|#[\uac24\ub7f0];gigabit=#[Gb]|#[Gb]|#[\uae30\uac00\ube44\ud2b8];gigabyte=#[GB]|#[GB]|#[\uae30\uac00\ubc14\uc774\ud2b8];gram=#[g]|#[g]|#[\uadf8\ub7a8];hectare=#[ha]|#[ha]|#[\ud5e5\ud0c0\ub974];hour=#[\uc2dc\uac04]|#[\uc2dc\uac04]|#[\uc2dc\uac04];inch=#[in]|#[\u2033]|#[\uc778\uce58];kilobit=#[kb]|#[kb]|#[\ud0ac\ub85c\ube44\ud2b8];kilobyte=#[kB]|#[kB]|#[\ud0ac\ub85c\ubc14\uc774\ud2b8];kilogram=#[kg]|#[kg]|#[\ud0ac\ub85c\uadf8\ub7a8];kilometer=#[km]|#[km]|#[\ud0ac\ub85c\ubbf8\ud130];liter=#[L]|#[L]|#[\ub9ac\ud130];megabit=#[Mb]|#[Mb]|#[\uba54\uac00\ube44\ud2b8];megabyte=#[MB]|#[MB]|#[\uba54\uac00\ubc14\uc774\ud2b8];meter=#[m]|#[m]|#[\ubbf8\ud130];microsecond=#[\u03bcs]|#[\u03bcs]|#[\ub9c8\uc774\ud06c\ub85c\ucd08];mile=#[mi]|#[mi]|#[\ub9c8\uc77c];mile-scandinavian=#[smi]|#[smi]|#[\uc2a4\uce78\ub514\ub098\ube44\uc544 \ub9c8\uc77c];milliliter=#[mL]|#[mL]|#[\ubc00\ub9ac\ub9ac\ud130];millimeter=#[mm]|#[mm]|#[\ubc00\ub9ac\ubbf8\ud130];millisecond=#[ms]|#[ms]|#[\ubc00\ub9ac\ucd08];minute=#[\ubd84]|#[\ubd84]|#[\ubd84];month=#[\uac1c\uc6d4]|#[\uac1c\uc6d4]|#[\uac1c\uc6d4];nanosecond=#[ns]|#[ns]|#[\ub098\ub178\ucd08];ounce=#[oz]|#[oz]|#[\uc628\uc2a4];percent=#[%]|#[%]|#[%];petabyte=#[PB]|#[PB]|#[\ud398\ud0c0\ubc14\uc774\ud2b8];pound=#[lb]|#[lb]|#[\ud30c\uc6b4\ub4dc];second=#[\ucd08]|#[\ucd08]|#[\ucd08];stone=#[st]|#[st]|#[\uc2a4\ud1a4];terabit=#[Tb]|#[Tb]|#[\ud14c\ub77c\ube44\ud2b8];terabyte=#[TB]|#[TB]|#[\ud14c\ub77c\ubc14\uc774\ud2b8];week=#[\uc8fc]|#[\uc8fc]|#[\uc8fc];yard=#[yd]|#[yd]|#[\uc57c\ub4dc];year=#[\ub144]|#[\ub144]|#[\ub144];kilometer-per-hour=#[km/h]|#[km/h]|[\uc2dc\uc18d] #[\ud0ac\ub85c\ubbf8\ud130];mile-per-hour=#[mi/h]|#[mph]|[\uc2dc\uc18d] #[\ub9c8\uc77c];meter-per-second=#[m/s]|#[m/s]|[\ucd08\uc18d] #[\ubbf8\ud130];liter-per-kilometer=#[L/km]|#[L/km]|[\ud0ac\ub85c\ubbf8\ud130\ub2f9] #[\ub9ac\ud130];mile-per-gallon=#[mpg]|#[mpg]|[\uac24\ub7f0\ub2f9] #[\ub9c8\uc77c]^zh-Hant>acre=# [\u82f1\u755d]|#[\u82f1\u755d]|# [\u82f1\u755d];bit=# [bit]|#[bit]|# [bit];byte=# [byte]|#[byte]|# [byte];celsius=#[\u00b0C]|#[\u00b0C]|[\u651d\u6c0f] # [\u5ea6];centimeter=# [\u516c\u5206]|#[\u516c\u5206]|# [\u516c\u5206];day=# [\u5929]|# [\u5929]|# [\u5929];degree=# [\u5ea6]|#[\u00b0]|# [\u5ea6];fahrenheit=#[\u00b0F]|#[\u00b0F]|[\u83ef\u6c0f] # [\u5ea6];fluid-ounce=# [\u6db2\u76ce\u53f8]|#[\u6db2\u76ce\u53f8]|# [\u6db2\u76ce\u53f8];foot=# [\u544e]|#[\u544e]|# [\u82f1\u5c3a];gallon=# [\u52a0\u4f96]|#[\u52a0\u4f96]|# [\u52a0\u4f96];gigabit=# [Gb]|#[Gb]|# [Gb];gigabyte=# [GB]|#[GB]|# [GB];gram=# [\u514b]|#[\u514b]|# [\u514b];hectare=# [\u516c\u9803]|#[\u516c\u9803]|# [\u516c\u9803];hour=# [\u5c0f\u6642]|# [\u5c0f\u6642]|# [\u5c0f\u6642];inch=# [\u540b]|#[\u540b]|# [\u82f1\u5bf8];kilobit=# [kb]|#[kb]|# [kb];kilobyte=# [kB]|#[kB]|# [kB];kilogram=# [\u516c\u65a4]|#[\u516c\u65a4]|# [\u516c\u65a4];kilometer=# [\u516c\u91cc]|#[\u516c\u91cc]|# [\u516c\u91cc];liter=# [\u5347]|#[\u5347]|# [\u516c\u5347];megabit=# [Mb]|#[Mb]|# [Mb];megabyte=# [MB]|#[MB]|# [MB];meter=# [\u516c\u5c3a]|#[\u516c\u5c3a]|# [\u516c\u5c3a];microsecond=# [\u5fae\u79d2]|#[\u03bcs]|# [\u5fae\u79d2];mile=# [\u82f1\u91cc]|#[\u82f1\u91cc]|# [\u82f1\u91cc];mile-scandinavian=# [\u65af\u582a\u5730\u90a3\u7dad\u4e9e\u91cc]|#[smi]|# [\u65af\u582a\u5730\u90a3\u7dad\u4e9e\u91cc];milliliter=# [\u6beb\u5347]|#[\u6beb\u5347]|# [\u6beb\u5347];millimeter=# [\u516c\u91d0]|#[\u516c\u91d0]|# [\u516c\u91d0];millisecond=# [\u6beb\u79d2]|# [\u6beb\u79d2]|# [\u6beb\u79d2];minute=# [\u5206\u9418]|# [\u5206\u9418]|# [\u5206\u9418];month=# [\u500b\u6708]|# [\u500b\u6708]|# [\u500b\u6708];nanosecond=# [\u5948\u79d2]|#[ns]|# [\u5948\u79d2];ounce=# [\u76ce\u53f8]|#[\u76ce\u53f8]|# [\u76ce\u53f8];percent=#[%]|#[%]|#[%];petabyte=# [PB]|#[PB]|# [PB];pound=# [\u78c5]|#[\u78c5]|# [\u78c5];second=# [\u79d2]|# [\u79d2]|# [\u79d2];stone=# [\u82f1\u77f3]|#[\u82f1\u77f3]|# [\u82f1\u77f3];terabit=# [Tb]|#[Tb]|# [Tb];terabyte=# [TB]|#[TB]|# [TB];week=# [\u9031]|# [\u9031]|# [\u9031];yard=# [\u78bc]|#[\u78bc]|# [\u78bc];year=# [\u5e74]|# [\u5e74]|# [\u5e74];kilometer-per-hour=# [\u516c\u91cc/\u5c0f\u6642]|#[\u516c\u91cc/\u5c0f\u6642]|[\u6bcf\u5c0f\u6642] # [\u516c\u91cc];mile-per-hour=# [\u82f1\u91cc/\u5c0f\u6642]|#[\u82f1\u91cc/\u5c0f\u6642]|[\u6bcf\u5c0f\u6642] # [\u82f1\u91cc];meter-per-second=# [\u516c\u5c3a/\u79d2]|#[\u516c\u5c3a/\u79d2]|[\u6bcf\u79d2] # [\u516c\u5c3a];liter-per-kilometer=# [\u5347/\u516c\u91cc]|#[\u5347/\u516c\u91cc]|[\u6bcf\u516c\u91cc] # [\u516c\u5347];mile-per-gallon=# [\u82f1\u91cc/\u52a0\u4f96]|#[\u82f1\u91cc/\u52a0\u4f96]|[\u6bcf\u52a0\u4f96] # [\u82f1\u91cc]', '^');
  for (let i = 0; i < locs.length; i++) {
    const j = locs[i].indexOf('>');
    o[locs[i].slice(0, j)] = locs[i].slice(j + 1);
  }
  return o;
});
const I$unitTable = I$memo(key => I$table(I$unitData()[key], ';', '='));
const I$perUnitData = I$lazy(() => I$table('acre=/ac|/ac| per acre;bit=/bit|/bit| per bit;byte=/byte|/B| per byte;celsius=/\u00b0C|/\u00b0C| per degree Celsius;centimeter=/cm|/cm| per centimeter;day=/d|/d| per day;degree=/deg|/\u00b0| per degree;fahrenheit=/\u00b0F|/\u00b0| per degree Fahrenheit;fluid-ounce=/fl oz|/fl oz| per fluid ounce;foot=/ft|/ft| per foot;gallon=/gal US|/gal| per gallon;gigabit=/Gb|/Gb| per gigabit;gigabyte=/GB|/GB| per gigabyte;gram=/g|/g| per gram;hectare=/ha|/ha| per hectare;hour=/h|/h| per hour;inch=/in|/in| per inch;kilobit=/kb|/kb| per kilobit;kilobyte=/kB|/kB| per kilobyte;kilogram=/kg|/kg| per kilogram;kilometer=/km|/km| per kilometer;liter=/L|/L| per liter;megabit=/Mb|/Mb| per megabit;megabyte=/MB|/MB| per megabyte;meter=/m|/m| per meter;microsecond=/\u03bcs|/\u03bcs| per microsecond;mile=/mi|/mi| per mile;mile-scandinavian=/smi|/smi| per mile-scandinavian;milliliter=/mL|/mL| per milliliter;millimeter=/mm|/mm| per millimeter;millisecond=/ms|/ms| per millisecond;minute=/min|/min| per minute;month=/m|/m| per month;nanosecond=/ns|/ns| per nanosecond;ounce=/oz|/oz| per ounce;percent=/%|/%| per percent;petabyte=/PB|/PB| per petabyte;pound=/lb|/lb| per pound;second=/s|/s| per second;stone=/st|/st| per stone;terabit=/Tb|/Tb| per terabit;terabyte=/TB|/TB| per terabyte;week=/w|/w| per week;yard=/yd|/yd| per yard;year=/y|/y| per year', ';', '='));
const I$unitSet = I$lazy(() => {
  const t = I$objCreate(null);
  for (let i = 0; i < I$UNITS.length; i++) t[I$UNITS[i]] = true;
  return t;
});
const I$isSanctionedUnit = u => I$unitSet()[u] === true;
const I$isWellFormedUnit = u => {
  if (I$isSanctionedUnit(u)) return true;
  const i = u.indexOf('-per-');
  if (i === -1) return false;
  return I$isSanctionedUnit(u.slice(0, i)) && I$isSanctionedUnit(u.slice(i + 5));
};
const I$isWellFormedCurrency = c => c.length === 3 && I$allAlpha(c);
const I$unitPatternCache = I$objCreate(null);
const I$unitPatternUncached = (unit, display, plural, dataLocale) => {
  const di = display === 'short' ? 0 : display === 'narrow' ? 1 : 2;
  let r = I$tagInfo(dataLocale || I$DEFAULT_LOCALE), key = r.lang;
  if (key === 'zh') key = I$addLikely(r.lang, r.script, r.region)[1] === 'Hant' ? 'zh-Hant' : '';
  const t = I$unitData()[key] !== undefined ? I$unitTable(key) : I$unitTable('en');
  let row = t[unit];
  if (row === undefined) {
    const i = unit.indexOf('-per-');
    const base = I$unitPattern(unit.slice(0, i), display, plural, dataLocale);
    const per = I$splitStr(I$perUnitData()[unit.slice(i + 5)], '|')[di];
    return base.slice(0, base.length - 1) + per + ']';
  }
  row = I$splitStr(row, '|')[di];
  const tilde = row.indexOf('~');
  if (tilde === -1) return row;
  return plural === 'one' ? row.slice(0, tilde) : row.slice(tilde + 1);
};
const I$unitPattern = (unit, display, plural, dataLocale) => {
  const k = dataLocale + '|' + unit + '|' + display + '|' + plural, c = I$unitPatternCache[k];
  return c !== undefined ? c : I$unitPatternCache[k] = I$unitPatternUncached(unit, display, plural, dataLocale);
};

const I$NF_LOCALE_KEYS = [ 'nu' ];
// default first, the same for every locale
const I$nuValues = I$lazy(() => {
  const list = I$numberingSystems().slice();
  list.splice(I$indexOf(list, 'latn'), 1);
  list.splice(0, 0, 'latn');
  return list;
});
const I$caValues = I$lazy(() => {
  const list = I$CALENDARS.slice();
  list.splice(I$indexOf(list, 'gregory'), 1);
  list.splice(0, 0, 'gregory');
  return list;
});
const I$NO_VALUES = [], I$HC_VALUES = [ null, 'h11', 'h12', 'h23', 'h24' ];
const I$nfLocaleData = (locale, key) => key === 'nu' ? I$nuValues() : I$NO_VALUES;
const I$setNumberFormatUnitOptions = (o, options) => {
  const style = I$getOption(options, 'style', 'string', [ 'decimal', 'percent', 'currency', 'unit' ], 'decimal');
  o.style = style;
  const currency = I$getOption(options, 'currency', 'string', undefined, undefined);
  if (currency === undefined) {
    if (style === 'currency') throw new TypeError('Currency code is required with currency style.');
  } else if (!I$isWellFormedCurrency(currency)) throw new RangeError('Invalid currency code : ' + currency);
  const currencyDisplay = I$getOption(options, 'currencyDisplay', 'string', [ 'code', 'symbol', 'narrowSymbol', 'name' ], 'symbol');
  const currencySign = I$getOption(options, 'currencySign', 'string', [ 'standard', 'accounting' ], 'standard');
  const unit = I$getOption(options, 'unit', 'string', undefined, undefined);
  if (unit === undefined) {
    if (style === 'unit') throw new TypeError('Unit is required with unit style.');
  } else if (!I$isWellFormedUnit(unit)) throw new RangeError('Invalid unit argument for Intl.NumberFormat() \'' + unit + '\'');
  const unitDisplay = I$getOption(options, 'unitDisplay', 'string', [ 'short', 'narrow', 'long' ], 'short');
  if (style === 'currency') {
    o.currency = I$asciiUpper(currency);
    o.currencyDisplay = currencyDisplay;
    o.currencySign = currencySign;
  }
  if (style === 'unit') {
    o.unit = unit;
    o.unitDisplay = unitDisplay;
  }
};
const I$INCREMENTS = [ 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000 ];
const I$setNumberFormatDigitOptions = (o, options, mnfdDefault, mxfdDefault, notation) => {
  const mnid = I$getNumberOption(options, 'minimumIntegerDigits', 1, 21, 1);
  let mnfd = options.minimumFractionDigits;
  let mxfd = options.maximumFractionDigits;
  let mnsd = options.minimumSignificantDigits;
  let mxsd = options.maximumSignificantDigits;
  o.minimumIntegerDigits = mnid;
  const roundingIncrement = I$getNumberOption(options, 'roundingIncrement', 1, 5000, 1);
  if (!I$contains(I$INCREMENTS, roundingIncrement)) throw new RangeError('roundingIncrement value is out of range.');
  const roundingMode = I$getOption(options, 'roundingMode', 'string', [ 'ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven' ], 'halfExpand');
  const roundingPriority = I$getOption(options, 'roundingPriority', 'string', [ 'auto', 'morePrecision', 'lessPrecision' ], 'auto');
  const trailingZeroDisplay = I$getOption(options, 'trailingZeroDisplay', 'string', [ 'auto', 'stripIfInteger' ], 'auto');
  if (roundingIncrement !== 1) mxfdDefault = mnfdDefault;
  o.roundingIncrement = roundingIncrement;
  o.roundingMode = roundingMode;
  o.trailingZeroDisplay = trailingZeroDisplay;
  const hasSd = mnsd !== undefined || mxsd !== undefined;
  const hasFd = mnfd !== undefined || mxfd !== undefined;
  let needSd = true, needFd = true;
  if (roundingPriority === 'auto') {
    needSd = hasSd;
    if (needSd || (!hasFd && notation === 'compact')) needFd = false;
  }
  if (needSd) {
    if (hasSd) {
      mnsd = I$defaultNumberOption(mnsd, 1, 21, 1);
      mxsd = I$defaultNumberOption(mxsd, mnsd, 21, 21);
      o.minimumSignificantDigits = mnsd;
      o.maximumSignificantDigits = mxsd;
    } else {
      o.minimumSignificantDigits = 1;
      o.maximumSignificantDigits = 21;
    }
  }
  if (needFd) {
    if (hasFd) {
      mnfd = I$defaultNumberOption(mnfd, 0, 100, undefined);
      mxfd = I$defaultNumberOption(mxfd, 0, 100, undefined);
      if (mnfd === undefined) mnfd = Math.min(mnfdDefault, mxfd);
      else if (mxfd === undefined) mxfd = Math.max(mxfdDefault, mnfd);
      else if (mnfd > mxfd) throw new RangeError('maximumFractionDigits value is out of range.');
      o.minimumFractionDigits = mnfd;
      o.maximumFractionDigits = mxfd;
    } else {
      o.minimumFractionDigits = mnfdDefault;
      o.maximumFractionDigits = mxfdDefault;
    }
  }
  if (!needSd && !needFd) {
    o.minimumFractionDigits = 0;
    o.maximumFractionDigits = 0;
    o.minimumSignificantDigits = 1;
    o.maximumSignificantDigits = 2;
    o.roundingType = 'morePrecision';
    o.roundingPriority = 'morePrecision';
  } else if (roundingPriority === 'auto') {
    o.roundingType = hasSd ? 'significantDigits' : 'fractionDigits';
    o.roundingPriority = 'auto';
  } else {
    o.roundingType = roundingPriority;
    o.roundingPriority = roundingPriority;
  }
  if (roundingIncrement !== 1) {
    if (o.roundingType !== 'fractionDigits') throw new TypeError('roundingIncrement requires fraction digits rounding');
    if (o.maximumFractionDigits !== o.minimumFractionDigits) throw new RangeError('maximumFractionDigits must equal minimumFractionDigits with roundingIncrement');
  }
};
const I$newDigitSlots = () => ({
  locale: '', dataLocale: '', numberingSystem: '', style: 'decimal', currency: undefined, currencyDisplay: undefined, currencySign: undefined,
  unit: undefined, unitDisplay: undefined, minimumIntegerDigits: 1, minimumFractionDigits: undefined, maximumFractionDigits: undefined,
  minimumSignificantDigits: undefined, maximumSignificantDigits: undefined, roundingType: '', roundingPriority: 'auto', roundingIncrement: 1,
  roundingMode: 'halfExpand', trailingZeroDisplay: 'auto', notation: 'standard', compactDisplay: undefined, useGrouping: 'auto', signDisplay: 'auto',
  boundFormat: undefined, type: undefined
});
const I$initializeNumberFormat = (locales, options) => {
  const requested = I$canonicalizeLocaleList(locales);
  options = I$coerceOptionsToObject(options);
  const o = I$newDigitSlots();
  const opt = { localeMatcher: I$getLocaleMatcher(options), nu: I$getUTypeOption(options, 'numberingSystem') };
  const r = I$resolveLocale(requested, opt, I$NF_LOCALE_KEYS, I$nfLocaleData);
  o.locale = r.locale;
  o.dataLocale = r.dataLocale;
  o.numberingSystem = r.nu;
  I$setNumberFormatUnitOptions(o, options);
  const style = o.style;
  const notation = I$getOption(options, 'notation', 'string', [ 'standard', 'scientific', 'engineering', 'compact' ], 'standard');
  o.notation = notation;
  let mnfdDefault, mxfdDefault;
  if (style === 'currency' && notation === 'standard') {
    mnfdDefault = mxfdDefault = I$currencyDigits(o.currency);
  } else {
    mnfdDefault = 0;
    mxfdDefault = style === 'percent' ? 0 : 3;
  }
  I$setNumberFormatDigitOptions(o, options, mnfdDefault, mxfdDefault, notation);
  const compactDisplay = I$getOption(options, 'compactDisplay', 'string', [ 'short', 'long' ], 'short');
  let defaultUseGrouping = 'auto';
  if (notation === 'compact') {
    o.compactDisplay = compactDisplay;
    defaultUseGrouping = 'min2';
  }
  const useGrouping = I$getBooleanOrStringOption(options, 'useGrouping', [ 'min2', 'auto', 'always', 'true', 'false' ], 'always', false, defaultUseGrouping);
  o.useGrouping = useGrouping;
  o.signDisplay = I$getOption(options, 'signDisplay', 'string', [ 'auto', 'never', 'always', 'exceptZero', 'negative' ], 'auto');
  return o;
};
const I$NumberFormat = function NumberFormat(locales, options) {
  return I$legacyConstruct(NumberFormat, new.target, this, 'an Intl.NumberFormat', I$initializeNumberFormat(locales, options));
};

// patterns: '#' number, '%' percent sign, '$' currency, '-' sign, [x] compact text
const I$nfLocaleRows = I$lazy(() => I$table('en=.|,|3,3|1|NaN|-#%|-$#|($#)|3,3,3,6,6,6,9,9,9,12,12,12/3:#[K]/6:#[M]/9:#[B]/12:#[T]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [thousand]/6:# [million]/9:# [billion]/12:# [trillion]|;de=,|.|3,3|1|NaN|-#\u00a0%|-#\u00a0$|-#\u00a0$|0,0,0,6,6,6,9,9,9,12,12,12/6:#\u00a0[Mio.]/9:#\u00a0[Mrd.]/12:#\u00a0[Bio.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [Tausend]/6:# [Million]~# [Millionen]/9:# [Milliarde]~# [Milliarden]/12:# [Billion]~# [Billionen]|AUD=AU$;es=,|.|3,3|2|NaN|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,6,9,9,12,12,12/3:#\u00a0[mil]/6:#\u00a0[M]/9:#\u00a0[M]/12:#\u00a0[B]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [mil]/6:# [mill\u00f3n]~# [millones]/9:# [mil millones]/12:# [bill\u00f3n]~# [billones]|USD=US$,JPY=JPY,GBP=GBP,CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,BRL=BRL,AUD=AUD,CAD=CAD,MXN=MXN,HKD=HKD;fr=,|\u202f|3,3|1|NaN|-#\u00a0%|-#\u00a0$|(#\u00a0$)|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[k]/6:#\u00a0[M]/9:#\u00a0[Md]/12:#\u00a0[Bn]|3,3,3,6,6,6,9,9,9,12,12,12/3:[mille]~# [mille]/6:# [million]~# [millions]/9:# [milliard]~# [milliards]/12:# [billion]~# [billions]|USD=$US,JPY=JPY,GBP=\u00a3GB,CNY=CNY,TWD=TWD,AUD=$AU,CAD=$CA,MXN=$MX,HKD=HKD;it=,|.|3,3|2|NaN|-#%|-#\u00a0$|-#\u00a0$|0,0,0,6,6,6,9,9,9,12,12,12/6:#\u00a0[Mln]/9:#\u00a0[Mld]/12:#\u00a0[Bln]|3,3,3,6,6,6,9,9,9,12,12,12/3:[mille]~# [mila]/6:# [milione]~# [milioni]/9:# [miliardo]~# [miliardi]/12:# [mille miliardi]~# [mila miliardi]|USD=USD,JPY=JPY,KRW=KRW,TWD=TWD,INR=INR,BRL=BRL,MXN=MXN,HKD=HKD;ja=.|,|3,3|1|NaN|-#%|-$#|($#)|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u4e07]/8:#[\u5104]/12:#[\u5146]|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u4e07]/8:#[\u5104]/12:#[\u5146]|JPY=\uffe5,CNY=\u5143;ko=.|,|3,3|1|NaN|-#%|-$#|($#)|3,4,4,4,4,8,8,8,8,12,12,12/3:#[\ucc9c]/4:#[\ub9cc]/8:#[\uc5b5]/12:#[\uc870]|3,4,4,4,4,8,8,8,8,12,12,12/3:#[\ucc9c]/4:#[\ub9cc]/8:#[\uc5b5]/12:#[\uc870]|USD=US$,JPY=JP\u00a5,AUD=AU$;zh=.|,|3,3|1|NaN|-#%|-$#|($#)|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u4e07]/8:#[\u4ebf]/12:#[\u4e07\u4ebf]|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u4e07]/8:#[\u4ebf]/12:#[\u4e07\u4ebf]|USD=US$,JPY=JP\u00a5,CNY=\u00a5,AUD=AU$;zh-Hant=.|,|3,3|1|\u975e\u6578\u503c|-#%|-$#|($#)|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u842c]/8:#[\u5104]/12:#[\u5146]|0,4,4,4,4,8,8,8,8,12,12,12/4:#[\u842c]/8:#[\u5104]/12:#[\u5146]|USD=US$,KRW=\uffe6,TWD=$,AUD=AU$;pt=,|.|3,3|1|NaN|-#%|-$\u00a0#|-$\u00a0#|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[mil]/6:#\u00a0[mi]/9:#\u00a0[bi]/12:#\u00a0[tri]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [mil]/6:# [milh\u00e3o]~# [milh\u00f5es]/9:# [bilh\u00e3o]~# [bilh\u00f5es]/12:# [trilh\u00e3o]~# [trilh\u00f5es]|USD=US$,JPY=JP\u00a5,AUD=AU$;pt-PT=,|\u00a0|3,3|2|NaN|-#%|-#\u00a0$|(#\u00a0$)|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[mil]/6:#\u00a0[M]/9:#\u00a0[mM]/12:#\u00a0[Bi]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [mil]/6:# [milh\u00e3o]~# [milh\u00f5es]/9:# [mil milh\u00f5es]/12:# [bili\u00e3o]~# [bili\u00f5es]|USD=US$,JPY=JP\u00a5,AUD=AU$;en-IN=.|,|3,2|1|NaN|-#%|-$#|($#)|3,3,5,5,7,7,7,10,10,12,12,12/3:#[K]/5:#[L]/7:#[Cr]/10:#[KCr]/12:#[LCr]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [thousand]/6:# [million]/9:# [billion]/12:# [trillion]|JPY=JP\u00a5;ru=,|\u00a0|3,3|1|\u043d\u0435\u00a0\u0447\u0438\u0441\u043b\u043e|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[\u0442\u044b\u0441.]/6:#\u00a0[\u043c\u043b\u043d]/9:#\u00a0[\u043c\u043b\u0440\u0434]/12:#\u00a0[\u0442\u0440\u043b\u043d]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [\u0442\u044b\u0441\u044f\u0447\u0430]~# [\u0442\u044b\u0441\u044f\u0447\u0438]/6:# [\u043c\u0438\u043b\u043b\u0438\u043e\u043d]~# [\u043c\u0438\u043b\u043b\u0438\u043e\u043d\u0430]/9:# [\u043c\u0438\u043b\u043b\u0438\u0430\u0440\u0434]~# [\u043c\u0438\u043b\u043b\u0438\u0430\u0440\u0434\u0430]/12:# [\u0442\u0440\u0438\u043b\u043b\u0438\u043e\u043d]~# [\u0442\u0440\u0438\u043b\u043b\u0438\u043e\u043d\u0430]|;nl=,|.|3,3|1|NaN|-#%|$\u00a0-#|($\u00a0#)|3,3,3,6,6,6,9,9,9,12,12,12/3:#[K]/6:#\u00a0[mln.]/9:#\u00a0[mld.]/12:#\u00a0[bln.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [duizend]/6:# [miljoen]/9:# [miljard]/12:# [biljoen]|USD=US$,JPY=JP\u00a5,AUD=AU$,CAD=C$;pl=,|\u00a0|3,3|2|NaN|-#%|-#\u00a0$|(#\u00a0$)|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[tys.]/6:#\u00a0[mln]/9:#\u00a0[mld]/12:#\u00a0[bln]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tysi\u0105c]~# [tysi\u0105ce]/6:# [milion]~# [miliony]/9:# [miliard]~# [miliardy]/12:# [bilion]~# [biliony]|USD=USD,JPY=JPY,GBP=GBP,CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,AUD=AUD,CAD=CAD,MXN=MXN,HKD=HKD;sv=,|\u00a0|3,3|1|NaN|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[tn]/6:#\u00a0[mn]/9:#\u00a0[md]/12:#\u00a0[bn]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tusen]/6:# [miljon]~# [miljoner]/9:# [miljard]~# [miljarder]/12:# [biljon]~# [biljoner]|USD=US$,JPY=JPY,GBP=GBP,CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,BRL=BR$,AUD=AUD,HKD=HKD;tr=,|.|3,3|1|NaN|-%#|-$#|($#)|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[B]/6:#\u00a0[Mn]/9:#\u00a0[Mr]/12:#\u00a0[Tn]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [bin]/6:# [milyon]/9:# [milyar]/12:# [trilyon]|AUD=AU$;hi=.|,|3,2|1|NaN|-#%|-$#|-$#|3,3,5,5,7,7,9,9,11,11,13,13/3:#\u00a0[\u0939\u091c\u093c\u093e\u0930]/5:#\u00a0[\u0932\u093e\u0916]/7:#\u00a0[\u0915\u0970]/9:#\u00a0[\u0905\u0970]/11:#\u00a0[\u0916\u0970]/13:#\u00a0[\u0928\u0940\u0932]|3,3,5,5,7,7,9,9,11,11,11,11/3:# [\u0939\u091c\u093c\u093e\u0930]/5:# [\u0932\u093e\u0916]/7:# [\u0915\u0930\u094b\u0921\u093c]/9:# [\u0905\u0930\u092c]/11:# [\u0916\u0930\u092c]|JPY=JP\u00a5;th=.|,|3,3|1|NaN|-#%|-$#|($#)|3,3,3,6,6,6,9,9,9,12,12,12/3:#[K]/6:#[M]/9:#[B]/12:#[T]|3,4,5,6,6,6,9,10,11,12,12,12/3:# [\u0e1e\u0e31\u0e19]/4:# [\u0e2b\u0e21\u0e37\u0e48\u0e19]/5:# [\u0e41\u0e2a\u0e19]/6:# [\u0e25\u0e49\u0e32\u0e19]/9:# [\u0e1e\u0e31\u0e19\u0e25\u0e49\u0e32\u0e19]/10:# [\u0e2b\u0e21\u0e37\u0e48\u0e19\u0e25\u0e49\u0e32\u0e19]/11:# [\u0e41\u0e2a\u0e19\u0e25\u0e49\u0e32\u0e19]/12:# [\u0e25\u0e49\u0e32\u0e19\u0e25\u0e49\u0e32\u0e19]|USD=US$,AUD=AU$;id=,|.|3,3|1|NaN|-#%|-$#|-$#|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[rb]/6:#\u00a0[jt]/9:#\u00a0[M]/12:#\u00a0[T]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [ribu]/6:# [juta]/9:# [miliar]/12:# [triliun]|USD=US$,JPY=JP\u00a5,INR=Rs,AUD=AU$;vi=,|.|3,3|1|NaN|-#%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[N]/6:#\u00a0[Tr]/9:#\u00a0[T]/12:#\u00a0[NT]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [ngh\u00ecn]/6:# [tri\u1ec7u]/9:# [t\u1ef7]/12:# [ngh\u00ecn t\u1ef7]|USD=US$,AUD=AU$;uk=,|\u00a0|3,3|1|NaN|-#%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[\u0442\u0438\u0441.]/6:#\u00a0[\u043c\u043b\u043d]/9:#\u00a0[\u043c\u043b\u0440\u0434]/12:#\u00a0[\u0442\u0440\u043b\u043d]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [\u0442\u0438\u0441\u044f\u0447\u0430]~# [\u0442\u0438\u0441\u044f\u0447\u0456]/6:# [\u043c\u0456\u043b\u044c\u0439\u043e\u043d]~# [\u043c\u0456\u043b\u044c\u0439\u043e\u043d\u0438]/9:# [\u043c\u0456\u043b\u044c\u044f\u0440\u0434]~# [\u043c\u0456\u043b\u044c\u044f\u0440\u0434\u0438]/12:# [\u0442\u0440\u0438\u043b\u044c\u0439\u043e\u043d]~# [\u0442\u0440\u0438\u043b\u044c\u0439\u043e\u043d\u0438]|USD=USD,EUR=EUR,GBP=GBP,CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,BRL=BRL,AUD=AUD,CAD=CAD,MXN=MXN,HKD=HKD;cs=,|\u00a0|3,3|1|NaN|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[tis.]/6:#\u00a0[mil.]/9:#\u00a0[mld.]/12:#\u00a0[bil.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tis\u00edc]~# [tis\u00edce]/6:# [milion]~# [miliony]/9:# [miliarda]~# [miliardy]/12:# [bilion]~# [biliony]|USD=US$,JPY=JP\u00a5,INR=INR,AUD=AU$;da=,|.|3,3|1|NaN|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[t]/6:#\u00a0[mio.]/9:#\u00a0[mia.]/12:#\u00a0[bio.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tusind]/6:# [million]~# [millioner]/9:# [milliard]~# [milliarder]/12:# [billion]~# [billioner]|USD=US$,JPY=JP\u00a5,AUD=AU$;fi=,|\u00a0|3,3|1|ep\u00e4luku|-#\u00a0%|-#\u00a0$|-#\u00a0$|3,3,3,6,6,6,9,9,9,12,12,12/3:#\u00a0[t.]/6:#\u00a0[milj.]/9:#\u00a0[mrd.]/12:#\u00a0[bilj.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tuhat]~# [tuhatta]/6:# [miljoona]~# [miljoonaa]/9:# [miljardi]~# [miljardia]/12:# [biljoona]~# [biljoonaa]|CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,BRL=BRL,AUD=AUD,CAD=CAD,MXN=MXN,HKD=HKD;nb=,|\u00a0|3,3|1|NaN|-#\u00a0%|-#\u00a0$|($\u00a0#)|3,3,3,6,6,6,9,9,9,12,12,12/3:#[k]/6:#\u00a0[mill.]/9:#\u00a0[mrd.]/12:#\u00a0[bill.]|3,3,3,6,6,6,9,9,9,12,12,12/3:# [tusen]/6:# [million]~# [millioner]/9:# [milliard]~# [milliarder]/12:# [billion]~# [billioner]|USD=USD,JPY=JPY,CNY=CNY,KRW=KRW,TWD=TWD,INR=INR,BRL=BRL,AUD=AUD,CAD=CAD,MXN=MXN,HKD=HKD;he=.|,|3,3|1|NaN|\u200e-#%|\u200f\u200e-#\u00a0\u200f$|\u200f\u200e-#\u00a0\u200f$|3,3,3,6,6,6,9,9,9,12,12,12/3:#[K]\u200f/6:#[M]\u200f/9:#[B]\u200f/12:#[T]\u200f|3,3,3,6,6,6,9,9,9,12,12,12/3:\u200f# [\u05d0\u05dc\u05e3]/6:\u200f# [\u05de\u05d9\u05dc\u05d9\u05d5\u05df]/9:\u200f# [\u05de\u05d9\u05dc\u05d9\u05d0\u05e8\u05d3]/12:\u200f# [\u05d8\u05e8\u05d9\u05dc\u05d9\u05d5\u05df]|', ';', '='));
const I$nfLocaleCache = I$objCreate(null);
const I$parseCompact = s => {
  const slash = s.indexOf('/'), exps = I$splitStr(s.slice(0, slash), ','), pats = I$objCreate(null);
  const rest = I$splitStr(s.slice(slash + 1), '/');
  for (let i = 0; i < exps.length; i++) exps[i] = +exps[i];
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i].indexOf(':'), p = rest[i].slice(c + 1), t = p.indexOf('~');
    pats[rest[i].slice(0, c)] = t === -1 ? [ p, p ] : [ p.slice(0, t), p.slice(t + 1) ];
  }
  return { exps, pats };
};
const I$numberLocaleKey = I$memo(dataLocale => {
  const r = I$tagInfo(dataLocale), rows = I$nfLocaleRows();
  if (r.lang === 'zh') {
    const m = I$addLikely(r.lang, r.script, r.region);
    return m[1] === 'Hant' ? 'zh-Hant' : 'zh';
  }
  if (r.region && rows[r.lang + '-' + I$asciiUpper(r.region)] !== undefined) return r.lang + '-' + I$asciiUpper(r.region);
  return rows[r.lang] !== undefined ? r.lang : 'en';
});
const I$localeSymbols = o => {
  // arabic digits come with their own separators and signs
  const nu = o.numberingSystem === 'arab' || o.numberingSystem === 'arabext' ? o.numberingSystem : '';
  const row = I$numberLocaleKey(o.dataLocale || I$DEFAULT_LOCALE), key = nu ? row + '/' + nu : row;
  let d = I$nfLocaleCache[key];
  if (d !== undefined) return d;
  const f = I$splitStr(I$nfLocaleRows()[row], '|'), g = I$splitStr(f[2], ',');
  d = {
    decimal: f[0], group: f[1], primary: +g[0], secondary: +g[1], minGrouping: +f[3], nan: f[4], percent: f[5], currency: f[6],
    accounting: f[7], compactShort: I$parseCompact(f[8]), compactLong: I$parseCompact(f[9]), symbols: f[10] ? I$table(f[10], ',', '=') : I$objCreate(null),
    minus: '-', plus: '+', percentSign: '%', inf: '∞', exp: 'E', approx: '~'
  };
  if (nu !== '') {
    const mark = nu === 'arab' ? '\u061c' : '\u200e';
    d.decimal = '\u066b';
    d.group = '\u066c';
    d.percentSign = nu === 'arab' ? '\u066a\u061c' : '\u066a';
    d.minus = nu === 'arab' ? mark + '-' : mark + '-' + mark;
    d.plus = nu === 'arab' ? mark + '+' : mark + '+' + mark;
  }
  I$nfLocaleCache[key] = d;
  return d;
};

const I$exponentForMagnitude = (o, mag) => {
  if (o.notation === 'scientific') return mag;
  if (o.notation === 'engineering') return Math.floor(mag / 3) * 3;
  if (o.notation === 'compact') {
    if (mag < 3) return 0;
    const exps = (o.compactDisplay === 'long' ? I$localeSymbols(o).compactLong : I$localeSymbols(o).compactShort).exps;
    return exps[mag - 3 < exps.length ? mag - 3 : exps.length - 1];
  }
  return 0;
};
const I$decShift = (x, k) => x.d === '' ? x : { neg: x.neg, kind: 'n', d: x.d, e: x.e + k };
const I$computeExponent = (o, x) => {
  if (x.d === '') return [ 0, 0 ];
  const mag = x.e - 1;
  if (o.notation === 'standard') return [ 0, mag ];
  const exponent = I$exponentForMagnitude(o, mag);
  const res = I$formatNumericToString(o, I$decShift(x, -exponent));
  if (res.rounded.d === '') return [ exponent, mag ];
  const newMag = res.rounded.e - 1;
  if (newMag === mag - exponent) return [ exponent, mag ];
  return [ I$exponentForMagnitude(o, mag + 1), mag + 1 ];
};
const I$groupInteger = (o, s, sym) => {
  const g = o.useGrouping, primary = sym.primary, secondary = sym.secondary;
  if (g === false) return [ s ];
  const minGrouping = g === 'always' ? 1 : g === 'min2' ? 2 : sym.minGrouping;
  if (s.length < primary + minGrouping) return [ s ];
  let out = [], end = s.length - primary;
  const tail = s.slice(end);
  while (end > secondary) {
    out.splice(0, 0, s.slice(end - secondary, end));
    end -= secondary;
  }
  out.splice(0, 0, s.slice(0, end));
  I$push(out, tail);
  return out;
};
const I$transliterate = (o, s) => {
  if (o.numberingSystem === 'latn' || !o.numberingSystem) return s;
  let digits = I$digitsFor(o.numberingSystem), out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 48 && c <= 57 ? digits[c - 48] : s[i];
  }
  return out;
};
const I$part = (type, value) => ({ type, value });
const I$expandPattern = (p, bracketType, fill, out) => {
  let lit = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '#' || c === '%' || c === '$' || c === '-' || c === '[') {
      if (lit !== '') {
        I$push(out, I$part('literal', lit));
        lit = '';
      }
      if (c === '[') {
        const e = p.indexOf(']', i);
        I$push(out, I$part(bracketType, p.slice(i + 1, e)));
        i = e;
      } else fill(c, out);
    } else lit += c;
  }
  if (lit !== '') I$push(out, I$part('literal', lit));
};

const I$pluralOperands = (s, e) => {
  const dot = s.indexOf('.');
  let i = dot === -1 ? s : s.slice(0, dot), f = dot === -1 ? '' : s.slice(dot + 1);
  if (e > 0) {
    const shift = f.length < e ? f.length : e;
    i = i + f.slice(0, shift) + I$zeros(e - shift);
    f = f.slice(shift);
    while (i.length > 1 && i[0] === '0') i = i.slice(1);
  }
  let t = f;
  while (t.length && t[t.length - 1] === '0') t = t.slice(0, -1);
  return { n: +(i + (f ? '.' + f : '')), i: +i, v: f.length, w: t.length, f: f === '' ? 0 : +f, t: t === '' ? 0 : +t, e: e || 0, iStr: i };
};
// cardinal rules, categories in cldr order
const I$PLURAL_RULES = I$table('ar=zero:n = 0;one:n = 1;two:n = 2;few:n % 100 = 3..10;many:n % 100 = 11..99|' +
  'fa=one:i = 0 or n = 1|hi=one:i = 0 or n = 1|bn=one:i = 0 or n = 1|' +
  'fr=one:i = 0,1;many:e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5|' +
  'es=one:n = 1;many:e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5|' +
  'it=one:i = 1 and v = 0;many:e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5|' +
  'pt=one:i = 0..1;many:e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5|' +
  'ca=one:i = 1 and v = 0;many:e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5|' +
  'gv=one:v = 0 and i % 10 = 1;two:v = 0 and i % 10 = 2;few:v = 0 and i % 100 = 0,20,40,60,80;many:v != 0|' +
  'sl=one:v = 0 and i % 100 = 1;two:v = 0 and i % 100 = 2;few:v = 0 and i % 100 = 3..4 or v != 0|' +
  'ru=one:v = 0 and i % 10 = 1 and i % 100 != 11;few:v = 0 and i % 10 = 2..4 and i % 100 != 12..14;many:v = 0 and i % 10 = 0 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 11..14|' +
  'uk=one:v = 0 and i % 10 = 1 and i % 100 != 11;few:v = 0 and i % 10 = 2..4 and i % 100 != 12..14;many:v = 0 and i % 10 = 0 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 11..14|' +
  'pl=one:i = 1 and v = 0;few:v = 0 and i % 10 = 2..4 and i % 100 != 12..14;many:v = 0 and i != 1 and i % 10 = 0..1 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 12..14|' +
  'cs=one:i = 1 and v = 0;few:i = 2..4 and v = 0;many:v != 0|sk=one:i = 1 and v = 0;few:i = 2..4 and v = 0;many:v != 0|' +
  'he=one:i = 1 and v = 0 or i = 0 and v != 0;two:i = 2 and v = 0|da=one:n = 1 or t != 0 and i = 0,1|' +
  'ja=|ko=|zh=|th=|vi=|id=|ms=|my=|lo=|km=|yue=|tr=one:n = 1|' +
  'lt=one:n % 10 = 1 and n % 100 != 11..19;few:n % 10 = 2..9 and n % 100 != 11..19;many:f != 0|lv=zero:n % 10 = 0 or n % 100 = 11..19 or v = 2 and f % 100 = 11..19;one:n % 10 = 1 and n % 100 != 11 or v = 2 and f % 10 = 1 and f % 100 != 11 or v != 2 and f % 10 = 1|' +
  'ga=one:n = 1;two:n = 2;few:n = 3..6;many:n = 7..10|cy=zero:n = 0;one:n = 1;two:n = 2;few:n = 3;many:n = 6', '|', '=');
const I$DEFAULT_PLURAL = 'one:i = 1 and v = 0';
const I$pluralRuleList = lang => {
  const r = I$PLURAL_RULES[lang];
  return r === undefined ? I$DEFAULT_PLURAL : r;
};
const I$matchRange = (v, list) => {
  const items = I$splitStr(list, ',');
  for (let k = 0; k < items.length; k++) {
    const d = items[k].indexOf('..');
    if (d === -1) {
      if (v === +items[k]) return true;
    } else if (v >= +items[k].slice(0, d) && v <= +items[k].slice(d + 2) && v === Math.floor(v)) return true;
  }
  return false;
};
const I$evalPluralCondition = (cond, op) => {
  const ors = cond.split(' or ');
  for (let a = 0; a < ors.length; a++) {
    let ands = ors[a].split(' and '), ok = true;
    for (let b = 0; b < ands.length && ok; b++) {
      let rel = I$splitStr(ands[b], ' '), v = op[rel[0]], k = 1;
      if (rel[1] === '%') {
        v = v % +rel[2];
        k = 3;
      }
      const res = I$matchRange(v, rel[k + 1]);
      ok = rel[k] === '=' ? res : !res;
    }
    if (ok) return true;
  }
  return false;
};
const I$pluralCategory = (type, s, lang, e) => {
  const op = I$pluralOperands(s, e);
  if (type === 'ordinal') {
    if (lang !== undefined && lang !== 'en') return 'other';
    const i10 = I$lastDigits(op.iStr, 1), i100 = I$lastDigits(op.iStr, 2);
    if (op.v !== 0) return 'other';
    if (i10 === 1 && i100 !== 11) return 'one';
    if (i10 === 2 && i100 !== 12) return 'two';
    if (i10 === 3 && i100 !== 13) return 'few';
    return 'other';
  }
  const rules = I$pluralRuleList(lang === undefined ? 'en' : lang);
  if (!rules) return 'other';
  const parts = I$splitStr(rules, ';');
  for (let k = 0; k < parts.length; k++) {
    const c = parts[k].indexOf(':');
    if (I$evalPluralCondition(parts[k].slice(c + 1), op)) return parts[k].slice(0, c);
  }
  return 'other';
};
const I$numberParts = (o, x, n, exponent, out) => {
  const sym = I$localeSymbols(o);
  if (x.kind === 'nan') {
    I$push(out, I$part('nan', sym.nan));
    return;
  }
  if (x.kind === 'inf') {
    I$push(out, I$part('infinity', sym.inf));
    return;
  }
  const core = (c, out) => {
    const dot = n.indexOf('.');
    const integer = dot === -1 ? n : n.slice(0, dot), fraction = dot === -1 ? '' : n.slice(dot + 1);
    const groups = I$groupInteger(o, integer, sym);
    for (let i = 0; i < groups.length; i++) {
      if (i) I$push(out, I$part('group', sym.group));
      I$push(out, I$part('integer', I$transliterate(o, groups[i])));
    }
    if (dot !== -1) {
      I$push(out, I$part('decimal', sym.decimal));
      I$push(out, I$part('fraction', I$transliterate(o, fraction)));
    }
  };
  if (o.notation === 'compact' && exponent > 0) {
    const pats = (o.compactDisplay === 'long' ? sym.compactLong : sym.compactShort).pats[exponent];
    I$expandPattern(pats[I$pluralCategory('cardinal', n) === 'one' ? 0 : 1], 'compact', core, out);
    return;
  }
  core('#', out);
  if (o.notation === 'scientific' || o.notation === 'engineering') {
    I$push(out, I$part('exponentSeparator', sym.exp));
    if (exponent < 0) I$push(out, I$part('exponentMinusSign', sym.minus));
    I$push(out, I$part('exponentInteger', I$transliterate(o, String(exponent < 0 ? -exponent : exponent))));
  }
};
const I$signFor = (o, x) => {
  const d = o.signDisplay;
  if (x.kind === 'nan') return d === 'always' ? '+' : '';
  const zero = x.kind === 'n' && x.d === '';
  if (d === 'never') return '';
  if (d === 'auto') return x.neg ? '-' : '';
  if (d === 'always') return x.neg ? '-' : '+';
  if (d === 'exceptZero') return zero ? '' : (x.neg ? '-' : '+');
  return x.neg && !zero ? '-' : '';
};
const I$currencyText = (o, numStr, sym) => {
  const c = o.currency, row = I$currencyData()[c];
  const display = o.currencyDisplay;
  if (display === 'code') return c;
  if (display === 'name') {
    if (row === undefined) return c;
    return I$pluralCategory('cardinal', numStr) === 'one' || row[4] === '' ? row[3] : row[4];
  }
  if (display !== 'narrowSymbol' && sym.symbols[c] !== undefined) return sym.symbols[c];
  if (row === undefined) return c;
  if (display === 'narrowSymbol' && row[2] !== '') return row[2];
  return row[1] !== '' ? row[1] : c;
};
const I$isLetterEnd = (s, atEnd) => {
  const c = s.charCodeAt(atEnd ? s.length - 1 : 0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
};
let I$lastSignAt = 0;
const I$partitionNumberPattern = (o, x) => {
  let exponent = 0, n = '', rounded = x;
  if (x.kind === 'n') {
    if (o.style === 'percent') x = I$decShift(x, 2);
    exponent = I$computeExponent(o, x)[0];
    const res = I$formatNumericToString(o, I$decShift(x, -exponent));
    n = res.str;
    rounded = res.rounded;
  }
  const sym = I$localeSymbols(o);
  const sign = I$signFor(o, rounded);
  const out = [];
  let pattern = '-#', ct = '', signAt = 0;
  if (o.style === 'percent') pattern = sym.percent;
  else if (o.style === 'currency') {
    ct = I$currencyText(o, n, sym);
    if (o.currencyDisplay === 'name') pattern = '-# $';
    else {
      pattern = o.currencySign === 'accounting' && sign === '-' ? sym.accounting : sym.currency;
      // currency spacing: separate a symbol ending/starting with a letter from the number
      let at = pattern.indexOf('$#');
      if (at !== -1 && I$isLetterEnd(ct, true)) pattern = pattern.slice(0, at + 1) + ' ' + pattern.slice(at + 1);
      at = pattern.indexOf('#$');
      if (at !== -1 && I$isLetterEnd(ct, false)) pattern = pattern.slice(0, at + 1) + ' ' + pattern.slice(at + 1);
    }
  } else if (o.style === 'unit') {
    const up = I$unitPattern(o.unit, o.unitDisplay, I$pluralCategory('cardinal', n), o.dataLocale);
    const h = up.indexOf('#');
    pattern = up.slice(0, h) + '-' + up.slice(h);
  }
  I$expandPattern(pattern, 'unit', (c, out) => {
    if (c === '#') I$numberParts(o, rounded, n, exponent, out);
    else if (c === '-') {
      signAt = out.length;
      if (sign === '-') I$push(out, I$part('minusSign', sym.minus));
      else if (sign === '+') I$push(out, I$part('plusSign', sym.plus));
    } else if (c === '%') I$push(out, I$part('percentSign', sym.percentSign));
    else I$push(out, I$part('currency', ct));
  }, out);
  I$lastSignAt = signAt;
  return out;
};
const I$partsToString = parts => {
  let s = '';
  for (let i = 0; i < parts.length; i++) s += parts[i].value;
  return s;
};
const I$partsToArray = (parts, extra) => {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (extra === 'source') I$push(out, { type: p.type, value: p.value, source: p.source });
    else if (extra === 'unit' && p.unit !== undefined) I$push(out, { type: p.type, value: p.value, unit: p.unit });
    else I$push(out, { type: p.type, value: p.value });
  }
  return I$createArray(out);
};
const I$RANGE_SEPS = I$table('es:-,it:-,zh:-,nl:-,ja:～,ko:~,pt-PT: - ');
const I$isNumberCore = t => t === 'integer' || t === 'group' || t === 'decimal' || t === 'fraction' || t === 'nan' || t === 'infinity' ||
  t === 'exponentSeparator' || t === 'exponentMinusSign' || t === 'exponentInteger';
const I$coreBounds = parts => {
  let i = 0, j = parts.length;
  while (i < j && !I$isNumberCore(parts[i].type)) i++;
  while (j > i && !I$isNumberCore(parts[j - 1].type)) j--;
  return [ i, j ];
};
const I$affixString = (parts, from, to) => {
  let s = '';
  for (let i = from; i < to; i++) s += parts[i].value;
  return s;
};
const I$codePointCount = s => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xdc00 || c > 0xdfff) n++;
  }
  return n;
};
// collapses equal affixes the way ICU does
const I$partitionNumberRange = (o, x, y) => {
  if (x.kind === 'nan' || y.kind === 'nan') throw new RangeError('Invalid range: NaN');
  const xp = I$partitionNumberPattern(o, x), yp = I$partitionNumberPattern(o, y), out = [];
  const sym = I$localeSymbols(o);
  if (I$partsToString(xp) === I$partsToString(yp)) {
    // FormatApproximately: the approximately sign goes where the sign is in the pattern
    const at = I$lastSignAt;
    for (let i = 0; i < xp.length; i++) {
      if (i === at) {
        const ap = I$part('approximatelySign', sym.approx);
        ap.source = 'shared';
        I$push(out, ap);
      }
      xp[i].source = 'shared';
      I$push(out, xp[i]);
    }
    return out;
  }
  const bx = I$coreBounds(xp), by = I$coreBounds(yp);
  const px = I$affixString(xp, 0, bx[0]), sx = I$affixString(xp, bx[1], xp.length);
  const py = I$affixString(yp, 0, by[0]), sy = I$affixString(yp, by[1], yp.length);
  const collapse = px === py && sx === sy && (o.style === 'unit' || I$codePointCount(px + sx) > 1);
  let key = I$numberLocaleKey(o.dataLocale || I$DEFAULT_LOCALE), sep = I$RANGE_SEPS[key];
  if (sep === undefined) sep = I$RANGE_SEPS[I$tagInfo(key).lang];
  if (sep === undefined) sep = '–';
  if (sep.length === 1 && (!collapse && px + sx + py + sy !== '')) sep = ' ' + sep + ' ';
  const lo = collapse ? bx[0] : 0, hiX = collapse ? bx[1] : xp.length, hiY = collapse ? by[1] : yp.length, loY = collapse ? by[0] : 0;
  for (let i = 0; i < lo; i++) {
    xp[i].source = 'shared';
    I$push(out, xp[i]);
  }
  for (let i = lo; i < hiX; i++) {
    xp[i].source = 'startRange';
    I$push(out, xp[i]);
  }
  const sp = I$part('literal', sep);
  sp.source = 'shared';
  I$push(out, sp);
  for (let i = loY; i < hiY; i++) {
    yp[i].source = 'endRange';
    I$push(out, yp[i]);
  }
  for (let i = hiX; i < xp.length; i++) {
    xp[i].source = 'shared';
    I$push(out, xp[i]);
  }
  return out;
};
const I$formatNumber = (o, x) => I$partsToString(I$partitionNumberPattern(o, x));

I$defineService(I$NumberFormat, 0, 'NumberFormat', {
  get format() {
    const o = I$unwrapLegacy(this, I$NumberFormat, 'an Intl.NumberFormat');
    if (o.boundFormat === undefined) {
      o.boundFormat = value => I$formatNumber(o, I$toIntlMV(value));
    }
    return o.boundFormat;
  },
  formatToParts(value) {
    const o = I$unwrapLegacy(this, I$NumberFormat, 'an Intl.NumberFormat');
    return I$partsToArray(I$partitionNumberPattern(o, I$toIntlMV(value)));
  },
  formatRange(start, end) {
    const o = I$unwrapLegacy(this, I$NumberFormat, 'an Intl.NumberFormat');
    if (start === undefined || end === undefined) throw new TypeError('start and end are required');
    const x = I$toIntlMV(start), y = I$toIntlMV(end);
    return I$partsToString(I$partitionNumberRange(o, x, y));
  },
  formatRangeToParts(start, end) {
    const o = I$unwrapLegacy(this, I$NumberFormat, 'an Intl.NumberFormat');
    if (start === undefined || end === undefined) throw new TypeError('start and end are required');
    const x = I$toIntlMV(start), y = I$toIntlMV(end);
    return I$partsToArray(I$partitionNumberRange(o, x, y), 'source');
  },
  resolvedOptions() {
    const o = I$unwrapLegacy(this, I$NumberFormat, 'an Intl.NumberFormat');
    return I$dropUndefined({
      locale: o.locale, numberingSystem: o.numberingSystem, style: o.style, currency: o.currency, currencyDisplay: o.currencyDisplay,
      currencySign: o.currencySign, unit: o.unit, unitDisplay: o.unitDisplay, minimumIntegerDigits: o.minimumIntegerDigits,
      minimumFractionDigits: o.minimumFractionDigits, maximumFractionDigits: o.maximumFractionDigits,
      minimumSignificantDigits: o.minimumSignificantDigits, maximumSignificantDigits: o.maximumSignificantDigits, useGrouping: o.useGrouping,
      notation: o.notation, compactDisplay: o.compactDisplay, signDisplay: o.signDisplay, roundingIncrement: o.roundingIncrement,
      roundingMode: o.roundingMode, roundingPriority: o.roundingPriority, trailingZeroDisplay: o.trailingZeroDisplay
    });
  }
});
const I$pluralCategoriesFor = (type, lang) => {
  if (type === 'ordinal') return lang === 'en' ? [ 'one', 'two', 'few', 'other' ] : [ 'other' ];
  const out = [], rules = I$pluralRuleList(lang), parts = rules ? I$splitStr(rules, ';') : [];
  for (let i = 0; i < parts.length; i++) I$push(out, parts[i].slice(0, parts[i].indexOf(':')));
  I$push(out, 'other');
  return out;
};
const I$PluralRules = function PluralRules(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.PluralRules requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$coerceOptionsToObject(options);
  const o = I$newDigitSlots();
  const opt = { localeMatcher: I$getLocaleMatcher(options) };
  o.type = I$getOption(options, 'type', 'string', [ 'cardinal', 'ordinal' ], 'cardinal');
  o.notation = I$getOption(options, 'notation', 'string', [ 'standard', 'scientific', 'engineering', 'compact' ], 'standard');
  const compactDisplay = I$getOption(options, 'compactDisplay', 'string', [ 'short', 'long' ], 'short');
  if (o.notation === 'compact') o.compactDisplay = compactDisplay;
  I$setNumberFormatDigitOptions(o, options, 0, 3, o.notation);
  const r = I$resolveLocale(requested, opt, [], I$nfLocaleData);
  o.locale = r.locale;
  o.dataLocale = r.dataLocale;
  I$setSlots(this, 'an Intl.PluralRules', o);
};
const I$resolvePlural = (o, x) => {
  if (x.kind !== 'n') return 'other';
  x = I$makeDec(false, x.d, x.e);
  const exponent = o.notation === 'compact' ? I$computeExponent(o, x)[0] : 0;
  const res = I$formatNumericToString(o, I$decShift(x, -exponent));
  return I$pluralCategory(o.type, res.str, I$tagInfo(o.dataLocale).lang, exponent);
};
I$defineService(I$PluralRules, 0, 'PluralRules', {
  select(value) {
    const o = I$thisSlots(this, 'an Intl.PluralRules');
    return I$resolvePlural(o, I$decFromNumber(I$toNum(value)));
  },
  selectRange(start, end) {
    const o = I$thisSlots(this, 'an Intl.PluralRules');
    if (start === undefined || end === undefined) throw new TypeError('start and end are required');
    const x = I$decFromNumber(I$toNum(start)), y = I$decFromNumber(I$toNum(end));
    if (x.kind === 'nan' || y.kind === 'nan') throw new RangeError('Invalid range: NaN');
    return I$resolvePlural(o, y);
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.PluralRules');
    return I$dropUndefined({
      locale: o.locale, type: o.type, notation: o.notation, compactDisplay: o.compactDisplay, minimumIntegerDigits: o.minimumIntegerDigits,
      minimumFractionDigits: o.minimumFractionDigits, maximumFractionDigits: o.maximumFractionDigits,
      minimumSignificantDigits: o.minimumSignificantDigits, maximumSignificantDigits: o.maximumSignificantDigits,
      pluralCategories: I$createArray(I$pluralCategoriesFor(o.type, I$tagInfo(o.dataLocale).lang)), roundingIncrement: o.roundingIncrement,
      roundingMode: o.roundingMode, roundingPriority: o.roundingPriority, trailingZeroDisplay: o.trailingZeroDisplay
    });
  }
});

const I$decompData = I$lazy(() => {
  let t = I$objCreate(null), parts = I$splitStr('5c:1t.lc,1:1t.ld,1:1t.le,1:1t.lf,1:1t.lk,1:1t.lm,2:1v.mf,1:1x.lc,1:1x.ld,1:1x.le,1:1x.lk,1:21.lc,1:21.ld,1:21.le,1:21.lk,2:26.lf,1:27.lc,1:27.ld,1:27.le,1:27.lf,1:27.lk,3:2d.lc,1:2d.ld,1:2d.le,1:2d.lk,1:2h.ld,3:2p.lc,1:2p.ld,1:2p.le,1:2p.lf,1:2p.lk,1:2p.lm,2:2r.mf,1:2t.lc,1:2t.ld,1:2t.le,1:2t.lk,1:2x.lc,1:2x.ld,1:2x.le,1:2x.lk,2:32.lf,1:33.lc,1:33.ld,1:33.le,1:33.lf,1:33.lk,3:39.lc,1:39.ld,1:39.le,1:39.lk,1:3d.ld,2:3d.lk,1:1t.lg,1:2p.lg,1:1t.li,1:2p.li,1:1t.mg,1:2p.mg,1:1v.ld,1:2r.ld,1:1v.le,1:2r.le,1:1v.lj,1:2r.lj,1:1v.lo,1:2r.lo,1:1w.lo,1:2s.lo,3:1x.lg,1:2t.lg,1:1x.li,1:2t.li,1:1x.lj,1:2t.lj,1:1x.mg,1:2t.mg,1:1x.lo,1:2t.lo,1:1z.le,1:2v.le,1:1z.li,1:2v.li,1:1z.lj,1:2v.lj,1:1z.mf,1:2v.mf,1:20.le,1:2w.le,3:21.lf,1:2x.lf,1:21.lg,1:2x.lg,1:21.li,1:2x.li,1:21.mg,1:2x.mg,1:21.lj,4:22.le,1:2y.le,1:23.mf,1:2z.mf,2:24.ld,1:30.ld,1:24.mf,1:30.mf,1:24.lo,1:30.lo,5:26.ld,1:32.ld,1:26.mf,1:32.mf,1:26.lo,1:32.lo,4:27.lg,1:33.lg,1:27.li,1:33.li,1:27.ln,1:33.ln,3:2a.ld,1:36.ld,1:2a.mf,1:36.mf,1:2a.lo,1:36.lo,1:2b.ld,1:37.ld,1:2b.le,1:37.le,1:2b.mf,1:37.mf,1:2b.lo,1:37.lo,1:2c.mf,1:38.mf,1:2c.lo,1:38.lo,3:2d.lf,1:39.lf,1:2d.lg,1:39.lg,1:2d.li,1:39.li,1:2d.lm,1:39.lm,1:2d.ln,1:39.ln,1:2d.mg,1:39.mg,1:2f.le,1:3b.le,1:2h.le,1:3d.le,1:2h.lk,1:2i.ld,1:3e.ld,1:2i.lj,1:3e.lj,1:2i.lo,1:3e.lo,y:27.m3,1:33.m3,e:2d.m3,1:39.m3,t:1t.lo,1:2p.lo,1:21.lo,1:2x.lo,1:27.lo,1:33.lo,1:2d.lo,1:39.lo,1:2d.lk.lg,1:39.lk.lg,1:2d.lk.ld,1:39.lk.ld,1:2d.lk.lo,1:39.lk.lo,1:2d.lk.lc,1:39.lk.lc,2:1t.lk.lg,1:2p.lk.lg,1:1t.lj.lg,1:2p.lj.lg,1:5i.lg,1:6e.lg,3:1z.lo,1:2v.lo,1:23.lo,1:2z.lo,1:27.mg,1:33.mg,1:27.mg.lg,1:33.mg.lg,1:c7.lo,1:ia.lo,1:2y.lo,4:1z.ld,1:2v.ld,3:26.lc,1:32.lc,1:1t.lm.ld,1:2p.lm.ld,1:5i.ld,1:6e.ld,1:60.ld,1:6w.ld,1:1t.lr,1:2p.lr,1:1t.lt,1:2p.lt,1:1x.lr,1:2t.lr,1:1x.lt,1:2t.lt,1:21.lr,1:2x.lr,1:21.lt,1:2x.lt,1:27.lr,1:33.lr,1:27.lt,1:33.lt,1:2a.lr,1:36.lr,1:2a.lt,1:36.lt,1:2d.lr,1:39.lr,1:2d.lt,1:39.lt,1:2b.me,1:37.me,1:2c.me,1:38.me,3:20.lo,1:2w.lo,7:1t.lj,1:2p.lj,1:1x.mf,1:2t.mf,1:27.lk.lg,1:33.lk.lg,1:27.lf.lg,1:33.lf.lg,1:27.lj,1:33.lj,1:27.lj.lg,1:33.lj.lg,1:2h.lg,1:3d.lg,7h:lc,1:ld,2:lv,1:lk.ld,1c:jd,a:1n,7:4o.ld,1:pd.ld,1:53,1:ph.ld,1:pj.ld,1:pl.ld,2:pr.ld,2:px.ld,1:q1.ld,1:qh.lk.ld,q:pl.lk,1:px.lk,1:q9.ld,1:qd.ld,1:qf.ld,1:qh.ld,1:qt.lk.ld,q:qh.lk,1:qt.lk,1:qn.ld,1:qt.ld,1:qx.ld,5:r6.ld,1:r6.lk,18:t1.lc,1:t1.lk,2:sz.ld,4:sm.lk,5:t6.ld,1:t4.lc,1:tf.li,b:t4.li,w:u0.li,n:tx.lc,1:tx.lk,2:tv.ld,4:uu.lk,5:u2.ld,1:u0.lc,1:ub.li,o:vo.lr,1:vp.lr,22:t2.li,1:ty.li,e:sw.li,1:ts.li,1:sw.lk,1:ts.lk,3:t1.li,1:tx.li,3:yg.lk,1:yh.lk,1:t2.lk,1:ty.lk,1:t3.lk,1:tz.lk,3:t4.lg,1:u0.lg,1:t4.lk,1:u0.lk,1:ta.lk,1:u6.lk,3:yw.lk,1:yx.lk,1:tp.lk,1:ul.lk,1:tf.lg,1:ub.lg,1:tf.lk,1:ub.lk,1:tf.ln,1:ub.ln,1:tj.lk,1:uf.lk,3:tn.lk,1:uj.lk,89:17r.18z,1:17r.190,1:18o.190,1:17r.191,1:18q.190,4a:1cl.190,2:1c1.190,h:1ci.190,gm:1t4.1to,8:1tc.1to,3:1tf.1to,10:1sl.1to,1:1sm.1to,1:1sn.1to,1:1ss.1to,1:1sx.1to,1:1sy.1to,1:1t7.1to,1:1tb.1to,30:1xj.1xa,1:1xj.1xz,g:1wh.1x8,1:1wi.1x8,2:1wv.1x8,2c:20i.20s,3:20o.20s,z:1zq.20s,1:1zr.20s,1:1zw.20s,3:20b.20s,6i:287.28m,3:287.27y,1:287.28n,g:275.27w,1:276.27w,1j:2aa.2c7,1i:2bq.2bi,1:2br.2bi,1:2bq.2c7,3g:2fa.2fq,3c:2in.2j9,7:2iu.2j9,1:2iu.2ja,2:2iu.2iq,1:2iu.2iq.2j9,3j:2me.2m6,1:2mf.2m6,1:2me.2mv,3y:2qh.2q2,2:2qh.2q7,1:2qh.2q7.2q2,1:2qh.2qn,9x:30i.33r,a:30s.33r,5:30x.33r,5:312.33r,5:317.33r,d:30g.33p,a:31t.31u,2:31t.31w,1:33m.328,2:33n.328,9:31t.328,i:32q.33r,a:330.33r,5:335.33r,5:33a.33r,5:33f.33r,d:32o.33p,31:36t.372,25c:5c5.5dh,2:5c7.5dh,2:5c9.5dh,2:5cb.5dh,2:5cd.5dh,4:5ch.5dh,15:5dm.5dh,2:5do.5dh,3:5dq.5dh,1:5dr.5dh,2:5du.5dh,jh:1t.md,1:2p.md,1:1u.lj,1:2q.lj,1:1u.mb,1:2q.mb,1:1u.mp,1:2q.mp,1:1v.mf.ld,1:2r.mf.ld,1:1w.lj,1:2s.lj,1:1w.mb,1:2s.mb,1:1w.mp,1:2s.mp,1:1w.mf,1:2s.mf,1:1w.ml,1:2s.ml,1:1x.lg.lc,1:2t.lg.lc,1:1x.lg.ld,1:2t.lg.ld,1:1x.ml,1:2t.ml,1:1x.mo,1:2t.mo,1:1x.mf.li,1:2t.mf.li,1:1y.lj,1:2u.lj,1:1z.lg,1:2v.lg,1:20.lj,1:2w.lj,1:20.mb,1:2w.mb,1:20.lk,1:2w.lk,1:20.mf,1:2w.mf,1:20.mm,1:2w.mm,1:21.mo,1:2x.mo,1:21.lk.ld,1:2x.lk.ld,1:23.ld,1:2z.ld,1:23.mb,1:2z.mb,1:23.mp,1:2z.mp,1:24.mb,1:30.mb,1:24.mb.lg,1:30.mb.lg,1:24.mp,1:30.mp,1:24.ml,1:30.ml,1:25.ld,1:31.ld,1:25.lj,1:31.lj,1:25.mb,1:31.mb,1:26.lj,1:32.lj,1:26.mb,1:32.mb,1:26.mp,1:32.mp,1:26.ml,1:32.ml,1:27.lf.ld,1:33.lf.ld,1:27.lf.lk,1:33.lf.lk,1:27.lg.lc,1:33.lg.lc,1:27.lg.ld,1:33.lg.ld,1:28.ld,1:34.ld,1:28.lj,1:34.lj,1:2a.lj,1:36.lj,1:2a.mb,1:36.mb,1:2a.mb.lg,1:36.mb.lg,1:2a.mp,1:36.mp,1:2b.lj,1:37.lj,1:2b.mb,1:37.mb,1:2b.ld.lj,1:37.ld.lj,1:2b.lo.lj,1:37.lo.lj,1:2b.mb.lj,1:37.mb.lj,1:2c.lj,1:38.lj,1:2c.mb,1:38.mb,1:2c.mp,1:38.mp,1:2c.ml,1:38.ml,1:2d.mc,1:39.mc,1:2d.mo,1:39.mo,1:2d.ml,1:39.ml,1:2d.lf.ld,1:39.lf.ld,1:2d.lg.lk,1:39.lg.lk,1:2e.lf,1:3a.lf,1:2e.mb,1:3a.mb,1:2f.lc,1:3b.lc,1:2f.ld,1:3b.ld,1:2f.lk,1:3b.lk,1:2f.lj,1:3b.lj,1:2f.mb,1:3b.mb,1:2g.lj,1:3c.lj,1:2g.lk,1:3c.lk,1:2h.lj,1:3d.lj,1:2i.le,1:3e.le,1:2i.mb,1:3e.mb,1:2i.mp,1:3e.mp,1:2w.mp,1:38.lk,1:3b.lm,1:3d.lm,2:an.lj,5:1t.mb,1:2p.mb,1:1t.ll,1:2p.ll,1:1t.le.ld,1:2p.le.ld,1:1t.le.lc,1:2p.le.lc,1:1t.le.ll,1:2p.le.ll,1:1t.le.lf,1:2p.le.lf,1:1t.mb.le,1:2p.mb.le,1:1t.li.ld,1:2p.li.ld,1:1t.li.lc,1:2p.li.lc,1:1t.li.ll,1:2p.li.ll,1:1t.li.lf,1:2p.li.lf,1:1t.mb.li,1:2p.mb.li,1:1x.mb,1:2t.mb,1:1x.ll,1:2t.ll,1:1x.lf,1:2t.lf,1:1x.le.ld,1:2t.le.ld,1:1x.le.lc,1:2t.le.lc,1:1x.le.ll,1:2t.le.ll,1:1x.le.lf,1:2t.le.lf,1:1x.mb.le,1:2t.mb.le,1:21.ll,1:2x.ll,1:21.mb,1:2x.mb,1:27.mb,1:33.mb,1:27.ll,1:33.ll,1:27.le.ld,1:33.le.ld,1:27.le.lc,1:33.le.lc,1:27.le.ll,1:33.le.ll,1:27.le.lf,1:33.le.lf,1:27.mb.le,1:33.mb.le,1:27.m3.ld,1:33.m3.ld,1:27.m3.lc,1:33.m3.lc,1:27.m3.ll,1:33.m3.ll,1:27.m3.lf,1:33.m3.lf,1:27.m3.mb,1:33.m3.mb,1:2d.mb,1:39.mb,1:2d.ll,1:39.ll,1:2d.m3.ld,1:39.m3.ld,1:2d.m3.lc,1:39.m3.lc,1:2d.m3.ll,1:39.m3.ll,1:2d.m3.lf,1:39.m3.lf,1:2d.m3.mb,1:39.m3.mb,1:2h.lc,1:3d.lc,1:2h.mb,1:3d.mb,1:2h.ll,1:3d.ll,1:2h.lf,1:3d.lf,7:q9.lv,1:q9.lw,1:q9.lv.lc,1:q9.lw.lc,1:q9.lv.ld,1:q9.lw.ld,1:q9.lv.n6,1:q9.lw.n6,1:pd.lv,1:pd.lw,1:pd.lv.lc,1:pd.lw.lc,1:pd.lv.ld,1:pd.lw.ld,1:pd.lv.n6,1:pd.lw.n6,1:qd.lv,1:qd.lw,1:qd.lv.lc,1:qd.lw.lc,1:qd.lv.ld,1:qd.lw.ld,3:ph.lv,1:ph.lw,1:ph.lv.lc,1:ph.lw.lc,1:ph.lv.ld,1:ph.lw.ld,3:qf.lv,1:qf.lw,1:qf.lv.lc,1:qf.lw.lc,1:qf.lv.ld,1:qf.lw.ld,1:qf.lv.n6,1:qf.lw.n6,1:pj.lv,1:pj.lw,1:pj.lv.lc,1:pj.lw.lc,1:pj.lv.ld,1:pj.lw.ld,1:pj.lv.n6,1:pj.lw.n6,1:qh.lv,1:qh.lw,1:qh.lv.lc,1:qh.lw.lc,1:qh.lv.ld,1:qh.lw.ld,1:qh.lv.n6,1:qh.lw.n6,1:pl.lv,1:pl.lw,1:pl.lv.lc,1:pl.lw.lc,1:pl.lv.ld,1:pl.lw.ld,1:pl.lv.n6,1:pl.lw.n6,1:qn.lv,1:qn.lw,1:qn.lv.lc,1:qn.lw.lc,1:qn.lv.ld,1:qn.lw.ld,3:pr.lv,1:pr.lw,1:pr.lv.lc,1:pr.lw.lc,1:pr.lv.ld,1:pr.lw.ld,3:qt.lv,1:qt.lw,1:qt.lv.lc,1:qt.lw.lc,1:qt.lv.ld,1:qt.lw.ld,1:qt.lv.n6,1:qt.lw.n6,2:px.lw,2:px.lw.lc,2:px.lw.ld,2:px.lw.n6,1:qx.lv,1:qx.lw,1:qx.lv.lc,1:qx.lw.lc,1:qx.lv.ld,1:qx.lw.ld,1:qx.lv.n6,1:qx.lw.n6,1:q1.lv,1:q1.lw,1:q1.lv.lc,1:q1.lw.lc,1:q1.lv.ld,1:q1.lw.ld,1:q1.lv.n6,1:q1.lw.n6,1:q9.lc,1:q9.ld,1:qd.lc,1:qd.ld,1:qf.lc,1:qf.ld,1:qh.lc,1:qh.ld,1:qn.lc,1:qn.ld,1:qt.lc,1:qt.ld,1:qx.lc,1:qx.ld,3:q9.lv.n9,1:q9.lw.n9,1:q9.lv.lc.n9,1:q9.lw.lc.n9,1:q9.lv.ld.n9,1:q9.lw.ld.n9,1:q9.lv.n6.n9,1:q9.lw.n6.n9,1:pd.lv.n9,1:pd.lw.n9,1:pd.lv.lc.n9,1:pd.lw.lc.n9,1:pd.lv.ld.n9,1:pd.lw.ld.n9,1:pd.lv.n6.n9,1:pd.lw.n6.n9,1:qf.lv.n9,1:qf.lw.n9,1:qf.lv.lc.n9,1:qf.lw.lc.n9,1:qf.lv.ld.n9,1:qf.lw.ld.n9,1:qf.lv.n6.n9,1:qf.lw.n6.n9,1:pj.lv.n9,1:pj.lw.n9,1:pj.lv.lc.n9,1:pj.lw.lc.n9,1:pj.lv.ld.n9,1:pj.lw.ld.n9,1:pj.lv.n6.n9,1:pj.lw.n6.n9,1:qx.lv.n9,1:qx.lw.n9,1:qx.lv.lc.n9,1:qx.lw.lc.n9,1:qx.lv.ld.n9,1:qx.lw.ld.n9,1:qx.lv.n6.n9,1:qx.lw.n6.n9,1:q1.lv.n9,1:q1.lw.n9,1:q1.lv.lc.n9,1:q1.lw.lc.n9,1:q1.lv.ld.n9,1:q1.lw.ld.n9,1:q1.lv.n6.n9,1:q1.lw.n6.n9,1:q9.li,1:q9.lg,1:q9.lc.n9,1:q9.n9,1:q9.ld.n9,2:q9.n6,1:q9.n6.n9,1:pd.li,1:pd.lg,1:pd.lc,1:pd.ld,1:pd.n9,2:qh,3:4o.n6,1:qf.lc.n9,1:qf.n9,1:qf.ld.n9,2:qf.n6,1:qf.n6.n9,1:ph.lc,1:ph.ld,1:pj.lc,1:pj.ld,1:pj.n9,1:69r.lc,1:69r.ld,1:69r.n6,1:qh.li,1:qh.lg,1:qh.lk.lc,1:qh.lk.ld,3:qh.n6,1:qh.lk.n6,1:pl.li,1:pl.lg,1:pl.lc,1:pl.ld,2:6bi.lc,1:6bi.ld,1:6bi.n6,1:qt.li,1:qt.lg,1:qt.lk.lc,1:qt.lk.ld,1:qp.lv,1:qp.lw,1:qt.n6,1:qt.lk.n6,1:px.li,1:px.lg,1:px.lc,1:px.ld,1:pt.lw,1:4o.lc,1:4o.ld,1:2o,3:qx.lc.n9,1:qx.n9,1:qx.ld.n9,2:qx.n6,1:qx.n6.n9,1:pr.lc,1:pr.ld,1:q1.lc,1:q1.ld,1:q1.n9,1:50,3:6bm,1:6bn,85:q1,4:23,1:1t.lm,33:6mo.mw,1:6mq.mw,j:6ms.mw,v:6og.mw,1:6ok.mw,1:6oi.mw,1h:6pv.mw,5:6q0.mw,3:6q3.mw,o:6qr.mw,2:6qt.mw,r:6rg.mw,3:6rn.mw,3:6rp.mw,2:6rs.mw,n:1p.mw,2:6sh.mw,b:6rx.mw,1:1o.mw,1:1q.mw,1:6sk.mw,1:6sl.mw,3:6sy.mw,1:6sz.mw,3:6t2.mw,1:6t3.mw,7:6t6.mw,1:6t7.mw,3:6te.mw,1:6tf.mw,3:6ti.mw,1:6tj.mw,z:6ua.mw,1:6ug.mw,1:6uh.mw,1:6uj.mw,1d:6t8.mw,1:6t9.mw,1:6tt.mw,1:6tu.mw,7:6uq.mw,1:6ur.mw,1:6us.mw,1:6ut.mw,1o:9hk,1:9hl,1iq:8gt.mw,12o:9jf.9ll,2:9jh.9ll,2:9jj.9ll,2:9jl.9ll,2:9jn.9ll,2:9jp.9ll,2:9jr.9ll,2:9jt.9ll,2:9jv.9ll,2:9jx.9ll,2:9jz.9ll,2:9k1.9ll,3:9k4.9ll,2:9k6.9ll,2:9k8.9ll,7:9kf.9ll,1:9kf.9lm,2:9ki.9ll,1:9ki.9lm,2:9kl.9ll,1:9kl.9lm,2:9ko.9ll,1:9ko.9lm,2:9kr.9ll,1:9kr.9lm,n:9ja.9ll,a:9lp.9ll,e:9m3.9ll,2:9m5.9ll,2:9m7.9ll,2:9m9.9ll,2:9mb.9ll,2:9md.9ll,2:9mf.9ll,2:9mh.9ll,2:9mj.9ll,2:9ml.9ll,2:9mn.9ll,2:9mp.9ll,3:9ms.9ll,2:9mu.9ll,2:9mw.9ll,7:9n3.9ll,1:9n3.9lm,2:9n6.9ll,1:9n6.9lm,2:9n9.9ll,1:9n9.9lm,2:9nc.9ll,1:9nc.9lm,2:9nf.9ll,1:9nf.9lm,n:9ly.9ll,3:9nz.9ll,1:9o0.9ll,1:9o1.9ll,1:9o2.9ll,4:9od.9ll,13ia:rpk,1:kc4,1:s7e,1:rt4,1:lw1,1:fg2,1:gkl,1:vj0,1:vj0,1:hn5,1:ssx,1:gw7,1:hmw,1:jcm,1:ne1,1:p6t,1:qin,1:qt6,1:r20,1:sjz,1:kxu,1:ljv,1:mah,1:mvy,1:q4d,1:sq2,1:uep,1:fia,1:ghh,1:l50,1:mjf,1:qi5,1:v8e,1:ifk,1:m3v,1:qfh,1:r50,1:jih,1:pnc,1:qvz,1:iq2,1:kd3,1:lm2,1:mpo,1:slq,1:fpi,1:g53,1:gda,1:jwk,1:l3n,1:mj4,1:nhj,1:pa9,1:qh2,1:qjg,1:s1b,1:tv6,1:upb,1:v7e,1:nt8,1:nzz,1:otc,1:q15,1:t1g,1:vb3,1:rfa,1:hjz,1:iro,1:okg,1:pdq,1:mle,1:nuy,1:rsy,1:ttj,1:hjs,1:i8y,1:kyb,1:lp6,1:lxr,1:oq7,1:oxj,1:tor,1:gcy,1:pe3,1:g64,1:g5o,1:o4c,1:ou6,1:q29,1:tpx,1:rk0,1:jin,1:kxu,1:rge,1:fg9,1:i5j,1:iz6,1:mtj,1:n74,1:gev,1:nwb,1:fr3,1:iw9,1:ff1,1:lho,1:k1k,1:opu,1:gjn,1:hge,1:ni9,1:q4p,1:re2,1:la2,1:sds,1:lfs,1:jjy,1:put,1:jog,1:n6t,1:fji,1:g2x,1:g5l,1:kn5,1:oo7,1:prj,1:rf6,1:ssv,1:gdx,1:gn6,1:ho3,1:ir0,1:k3p,1:m4e,1:nxm,1:tkd,1:ui2,1:vbr,1:vda,1:gbf,1:kau,1:l87,1:sbm,1:ino,1:j9s,1:jcw,1:jve,1:lyb,1:mdl,1:n0p,1:o22,1:ovo,1:pdb,1:s9y,1:q9a,1:sgz,1:t3e,1:g7r,1:gbn,1:gql,1:ma0,1:r0i,1:re2,1:iq1,1:iyd,1:jnf,1:l9q,1:oji,1:mt1,1:fl0,1:h6h,1:i5j,1:iii,1:izg,1:muq,1:mzt,1:p7e,1:pc6,1:svo,1:tti,1:tvs,1:u1k,1:fpn,1:o1a,1:ss4,1:trs,1:j4x,1:fie,1:fyy,1:i5q,1:i7z,1:k2h,1:kxu,1:mha,1:ncy,1:q9o,1:sjg,1:vil,1:k94,1:tny,1:gax,1:kfv,1:kj7,1:lkx,1:luk,1:mx5,1:n6h,1:nsb,1:opc,1:u3i,1:g31,1:je6,1:tq0,1:fu3,1:ie1,1:lpm,1:sa2,1:ivf,1:j7o,1:kk7,1:mtj,1:tqe,1:g89,1:glr,1:i91,1:k5v,1:kem,1:ko8,1:lid,1:mx2,1:naa,1:p6h,1:r0v,1:r1d,1:sss,1:tsy,1:gfz,1:lve,1:gm5,1:mhc,1:n14,1:qgq,1:tr7,1:uvr,1:vbz,1:kgn,1:lor,1:pns,1:o97,1:obk,1:olu,1:mo0,1:m8p,1:riw,1:fk0,1:px2,1:g8q,1:g7b,1:ip2,1:jir,1:onq,1:i2t,1:ljy,1:kac,1:saj,1:qx8,1:tot,1:r63,1:iqb,1:g1s,1:gxs,3:hga,2:k8k,3:g66,1:mqy,1:ngq,1:ny4,1:nz2,1:nz9,1:o0f,1:tw6,1:on2,1:p8d,2:qhe,2:rg8,3:shk,1:sn1,4:u7j,1:u7w,1:u94,1:v5g,1:sm6,1:trr,1:fqm,1:fzb,1:g25,1:gcp,1:gdg,1:ggh,1:gwt,1:gzq,1:h2g,1:hfk,1:hig,1:i90,1:i9a,1:j2s,1:j8o,1:j9q,1:jci,1:k0f,1:k4i,1:k9d,1:kn9,1:lmf,1:lqy,1:lya,1:mem,1:mjv,1:mxu,1:ntd,1:ny6,1:nyh,1:nyg,1:nyo,1:nyu,1:nz1,1:o0d,1:o0e,1:o5c,1:o75,1:og0,1:ovo,1:ow9,1:oxt,1:p6a,1:pad,1:pnx,1:prt,1:prt,1:q53,1:r2o,1:r6e,1:rgh,1:ri1,1:rtf,1:ruw,1:sdy,1:shk,1:tsz,1:u0v,1:u2j,1:j1x,1:36cu,1:pp4,3:ffq,1:g51,1:g2w,1:fpc,1:g1x,1:g3k,1:gcn,1:ge2,1:gwt,1:gut,1:gwp,1:gyq,1:hga,1:hir,1:hms,1:hn8,1:huq,1:i08,1:iqa,1:iqh,1:iuh,1:iwd,1:j4o,1:j7y,1:j60,1:j9q,1:j8g,1:jci,1:jec,1:jpg,1:jrw,1:jte,1:k0m,1:k8k,1:kd3,1:kd7,1:keu,1:l89,1:la2,1:lkx,1:lwb,1:lvv,1:lya,1:m5a,1:mem,1:nmv,1:mk5,1:mnj,1:mqy,1:n01,1:n46,1:n5n,1:nbx,1:nbz,1:ngq,1:nh7,1:nhw,1:nka,1:nk0,1:nv0,1:o8h,1:og0,1:ol7,1:orf,1:ovo,1:p4u,1:pad,1:pxu,1:q27,1:qrd,1:r41,1:r5y,1:r6e,1:ren,1:rg8,1:rez,1:rgh,1:rge,1:rfx,1:ri1,1:rka,1:ruw,1:sag,1:sj6,1:srd,1:sxi,1:tq4,1:tsz,1:tw6,1:tzv,1:u0v,1:u17,1:u2j,1:umq,1:vj0,1:313e,1:3138,1:33dh,1:brx,1:cns,1:cop,1:39e1,1:3bgw,1:3i6r,1:vgj,1:vim,1w:15l.14k,2:16a.14n,b:161.14x,1:161.14y,1:161.14s.14x,1:161.14s.14y,1:15c.14n,1:15c.14o,1:15c.14s,1:15d.14s,1:15e.14s,1:15f.14s,1:15g.14s,1:15h.14s,1:15i.14s,2:15k.14s,1:15l.14s,1:15m.14s,1:15n.14s,1:15o.14s,2:15q.14s,2:15s.14s,1:15t.14s,2:15v.14s,1:15w.14s,2:15y.14s,1:15z.14s,1:160.14s,1:161.14s,1:162.14s,1:15h.14p,1:15d.14v,1:15n.14v,1:15w.14v,22j:1fpu.lj,r:1fq2.lj,246:1huh.1hve,2:1huj.1hve,f:1hut.1hve,3n:1hyp.1hyf,1:1hyq.1hyf,f0:1idj.1ida,1:1idj.1idz,1j:1if6.1ih5,2:1if8.1igr,9:1iff.1igy,3:1ifk.1ih5,1g:1igy.1igy,2:1igy.1igo,1:1igy.1ih5,6r:1int.1inu,1:1int.1ink,2:1int.1inx,70:1iuw.1iun,1:1iux.1iun,ot:1jjp.1jjk,e7d:1xr2.1xr2,1:1xr2.1xrd,1:1xr2.1xr3,1:1xrd.1xr3,1:1xr2.1xr4,1:1xr2.1xr2.1xr3,1:1xr2.1xrd.1xr3,1:1xr2.1xr2.1xr4,2f4:206f.206f,1:206b.206f,1:206b.206f.206f,jqs:2jx3.2jxh,1:2jx4.2jxh,1:2jx4.2jxh.2jxq,1:2jx4.2jxh.2jxr,1:2jx4.2jxh.2jxs,1:2jx4.2jxh.2jxt,1:2jx4.2jxh.2jxu,2f:2jzt.2jxh,1:2jzu.2jxh,1:2jzt.2jxh.2jxq,1:2jzu.2jxh.2jxq,1:2jzt.2jxh.2jxr,1:2jzu.2jxh.2jxr,1m4g:fgd,1:fg8,1:fgh,1:2tcy,1:fog,1:fqm,1:fqz,1:fsy,1:fwa,1:fx5,1:fzb,1:fyn,1:ae6,1:2ud6,1:g25,1:g2c,1:g2s,1:g3b,1:2u58,1:aex,1:g2v,1:g3x,1:2u6j,1:g47,1:g4k,1:fkc,1:g4s,1:g51,1:3ly7,1:g6t,1:g77,1:afz,1:g8r,1:g92,1:gaa,1:gaf,1:ahh,1:gcn,1:gcp,1:gdg,1:ge2,1:ged,1:gee,1:gev,1:gg9,1:ggh,1:ggq,1:ghf,1:ghp,1:ghr,1:ghr,1:ghr,1:2v58,1:m7k,1:gju,1:gkf,1:2vdv,1:gkr,1:gkx,1:gli,1:gpq,1:gmw,1:gnc,1:go8,1:gpu,1:gs6,1:gsw,1:gur,1:gv7,1:gw4,1:gw4,1:gwp,1:gx7,1:gxf,1:gxu,1:h7a,1:gzq,1:h7b,1:h1t,1:h2s,1:g7b,1:hke,1:hce,1:hdg,1:he5,1:haj,1:hf6,1:hf5,1:hik,1:2x9g,1:hki,1:hkn,1:hl2,1:hlm,1:hlu,1:hnm,1:2xm0,1:2xnu,1:hrg,1:hsr,1:ht3,1:hqw,1:huu,1:aum,1:av0,1:hzc,1:i0u,1:i0u,1:2y88,1:i4j,1:i54,1:i5j,1:i5v,1:2yhk,1:i67,1:i6e,1:itv,1:i76,1:ayp,1:i8w,1:i9a,1:ibk,1:ia5,1:2z1g,1:if7,1:2z1i,1:ige,1:igb,1:igs,1:ijl,1:ijm,1:b3j,1:ikd,1:ilk,1:im5,1:ind,1:b4y,1:2zr7,1:b5o,1:ipc,1:ipf,1:ipi,1:iq2,1:3pg2,1:iri,1:3035,1:3035,1:poh,1:isi,1:isi,1:b7r,1:335k,1:3cgq,1:iua,1:iuj,1:b8j,1:ivu,1:ix9,1:ixj,1:iyh,1:j29,1:bay,1:ba4,1:j2s,1:30t0,1:j47,1:j7s,1:j7w,1:j7y,1:j7w,1:j96,1:j9q,1:jaq,1:jac,1:jan,1:jby,1:jci,1:jcm,1:jdc,1:jdn,1:jfh,1:jht,1:jis,1:jm8,1:31n0,1:jlp,1:jjw,1:jmw,1:jnn,1:jqc,1:31td,1:js2,1:jph,1:jop,1:bhq,1:ju1,1:jum,1:jvh,1:juf,1:bjg,1:k0f,1:k18,1:32mi,1:k4j,1:kc8,1:k7d,1:bo9,1:k9d,1:bns,1:bms,1:g42,1:g45,1:kcg,1:k9o,1:pf1,1:deh,1:kd3,1:kd7,1:kdd,1:kf2,1:ker,1:33cz,1:bpl,1:kje,1:kg5,1:klu,1:kn9,1:33hp,1:kni,1:kkf,1:kr8,1:brx,1:ksi,1:kv7,1:kx6,1:l2g,1:33xf,1:l3v,1:bvc,1:l5t,1:34br,1:l78,1:bwu,1:l82,1:l9b,1:la2,1:la3,1:34p9,1:2yvf,1:34sa,1:le6,1:354s,1:lhb,1:lhp,1:lev,1:ljq,1:lku,1:lmf,1:lkx,1:lm1,1:lmg,1:lmt,1:357i,1:lkk,1:lrj,1:lta,1:c37,1:lvv,1:lvr,1:35jl,1:lq1,1:m0e,1:35ni,1:35ou,1:m2u,1:m61,1:m5a,1:m57,1:c5y,1:m6i,1:m7x,1:m7r,1:m99,1:2u5h,1:mdh,1:368z,1:mfw,1:36i3,1:mjs,1:mk5,1:mkw,1:36yw,1:mm8,1:mmt,1:3779,1:37dg,1:mt6,1:mtn,1:cdo,1:mud,1:ce0,1:ce0,1:myv,1:mzg,1:n01,1:n0l,1:n2i,1:cgr,1:n50,1:386u,1:n5q,1:389e,1:n74,1:2zrz,1:nbk,1:38v5,1:38vs,1:38zo,1:cn0,1:cnc,1:nhw,1:394j,1:394i,1:395l,1:396b,1:nj2,1:nj3,1:nj3,1:nka,1:cop,1:nm3,1:cp2,1:cra,1:39r1,1:nri,1:nt8,1:nv0,1:ctf,1:3a5i,1:nyu,1:3a8q,1:3a9x,1:o0f,1:o2z,1:cvj,1:o5c,1:o5m,1:o5r,1:3at8,1:3b1j,1:3b1j,1:oa6,1:d1e,1:3b8r,1:og6,1:og9,1:d2f,1:3beo,1:onm,1:d5s,1:oo8,1:oo3,1:oow,1:3c06,1:orn,1:d8h,1:ouf,1:ow2,1:oxx,1:d9w,1:3ciw,1:3cjr,1:dax,1:3cnt,1:p6i,1:3cqm,1:p79,1:pa2,1:pad,1:3d22,1:3d43,1:pcw,1:3d7s,1:pdc,1:33a7,1:ded,1:pf6,1:phf,1:dfv,1:pj2,1:hx1,1:3dlz,1:3dmd,1:33bn,1:33bw,1:poh,1:pok,1:sda,1:dij,1:psh,1:psb,1:pst,1:gc3,1:ptd,1:ptf,1:ptp,1:puu,1:3ebg,1:put,1:pwd,1:pyb,1:q0d,1:pwj,1:q0t,1:q1z,1:q53,1:pxv,1:q16,1:q18,1:q1o,1:3eie,1:3eqz,1:3emt,1:dnv,1:q9d,1:q9f,1:qae,1:3g0a,1:qck,1:3f3g,1:dp9,1:dpd,1:3f75,1:3ff6,1:dpn,1:qj4,1:qjg,1:qjr,1:qjt,1:qll,1:qko,1:qoe,1:qn6,1:qrd,1:qp4,1:qqz,1:qrq,1:dsn,1:qu9,1:qv5,1:dtl,1:qxs,1:qxv,1:3giv,1:r13,1:r1a,1:dv9,1:r22,1:aez,1:3gz2,1:3h46,1:dz2,1:dzb,1:rds,1:rfx,1:rka,1:rpx,1:3hrc,1:rsb,1:rsx,1:rvf,1:rxz,1:3i9b,1:2upw,1:s0b,1:rzw,1:s1c,1:2uvy,1:s7o,1:sag,1:3jki,1:3jl9,1:sk4,1:smp,1:snl,1:3ju6,1:snv,1:svs,1:t07,1:t08,1:sxo,1:t89,1:t91,1:3ksa,1:tjf,1:ej9,1:tkn,1:3l2v,1:eli,1:ts3,1:iia,1:tur,1:3ltx,1:3lzu,1:epa,1:epi,1:u00,1:3mdm,1:er6,1:3mhi,1:u17,1:u17,1:u21,1:3mpi,1:u76,1:eur,1:u95,1:ucn,1:ude,1:uf2,1:ez2,1:3nsg,1:umq,1:uv4,1:v0d,1:f66,1:f71,1:v3b,1:3owe,1:f7c,1:3oxx,1:3p5a,1:3p8x,1:vcr,1:f9y,1:veh,1:vem,1:vet,1:vf3,1:vfa,1:vgb,1:3pxc', ','), key = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], j = p.indexOf(':'), cps = I$splitStr(p.slice(j + 1), '.'), v = [];
    for (let k = 0; k < cps.length; k++) I$push(v, parseInt(cps[k], 36));
    key += parseInt(p.slice(0, j), 36);
    t[key] = v;
  }
  return t;
});
const I$cccData = I$lazy(() => {
  const t = I$objCreate(null), parts = I$splitStr('lx:232,ly:220,lz:220,m0:220,m1:220,m2:232,m3:216,m4:220,m5:220,m6:220,m7:220,m8:220,m9:202,ma:202,mb:220,mc:220,md:220,me:220,mf:202,mg:202,mh:220,mi:220,mj:220,mk:220,ml:220,mm:220,mn:220,mo:220,mp:220,mq:220,mr:220,ms:1,mt:1,mu:1,mv:1,mw:1,mx:220,my:220,mz:220,n0:220,n9:240,nb:220,nc:220,nd:220,nh:220,ni:220,nj:0,nn:220,no:220,np:220,nq:220,ns:232,nt:220,nu:220,nw:233,nx:234,ny:234,nz:233,o0:234,o1:234,o2:233', ',');
  for (let i = 0; i < parts.length; i++) {
    const j = parts[i].indexOf(':');
    t[parseInt(parts[i].slice(0, j), 36)] = +parts[i].slice(j + 1);
  }
  return t;
});
const I$combiningClass = c => {
  if (c < 0x300 || c > 0x36f) return 0;
  const v = I$cccData()[c];
  return v === undefined ? 230 : v;
};
const I$nfd = s => {
  const out = [], d = I$decompData();
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c > 0xffff) i++;
    if (c >= 0xac00 && c <= 0xd7a3) {
      const si = c - 0xac00;
      I$push(out, 0x1100 + Math.floor(si / 588));
      I$push(out, 0x1161 + Math.floor((si % 588) / 28));
      if (si % 28) I$push(out, 0x11a7 + si % 28);
      continue;
    }
    const m = d[c];
    if (m === undefined) I$push(out, c);
    else for (let k = 0; k < m.length; k++) I$push(out, m[k]);
  }
  for (let i = 1; i < out.length; i++) {
    let j = i;
    while (j > 0) {
      const a = I$combiningClass(out[j - 1]), b = I$combiningClass(out[j]);
      if (b === 0 || a <= b) break;
      const tmp = out[j - 1];
      out[j - 1] = out[j];
      out[j] = tmp;
      j--;
    }
  }
  return out;
};
const I$isMark = c => (c >= 0x300 && c <= 0x36f) || (c >= 0x1ab0 && c <= 0x1aff) || (c >= 0x1dc0 && c <= 0x1dff) || (c >= 0x20d0 && c <= 0x20ff) || (c >= 0xfe20 && c <= 0xfe2f);
const I$isSpaceOrPunct = c => {
  if (I$isWS(c)) return true;
  if (c < 0x80) return !((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122));
  return (c >= 0x2000 && c <= 0x206f) || (c >= 0x3000 && c <= 0x303f) || c === 0xa1 || c === 0xa7 || c === 0xab || c === 0xb6 || c === 0xb7 || c === 0xbb || c === 0xbf;
};
const I$lowerCp = c => {
  if ((c >= 65 && c <= 90) || (c >= 0xc0 && c <= 0xde && c !== 0xd7)) return c + 32;
  if (c < 0x80) return c;
  const s = String.fromCodePoint(c), l = s.toLowerCase();
  return l.length === s.length ? l.codePointAt(0) : c;
};
const I$collationElements = (o, s) => {
  const cps = I$nfd(s), out = [];
  const expand = o.dataLocale === 'de' && (o.collation === 'phonebk' || o.usage === 'search');
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (o.ignorePunctuation && I$isSpaceOrPunct(c)) continue;
    if (I$isMark(c)) {
      if (out.length) out[out.length - 1][1] += String.fromCharCode(c);
      continue;
    }
    const l = I$lowerCp(c), upper = l !== c;
    if (expand && cps[i + 1] === 0x308 && (l === 97 || l === 111 || l === 117)) {
      I$push(out, [ l, '', upper ]);
      I$push(out, [ 101, '\u0308', upper ]);
      i++;
      continue;
    }
    if (o.numeric && c >= 48 && c <= 57) {
      let j = i;
      while (j < cps.length && cps[j] >= 48 && cps[j] <= 57) j++;
      let digits = '';
      for (let k = i; k < j; k++) digits += String.fromCharCode(cps[k]);
      while (digits.length > 1 && digits[0] === '0') digits = digits.slice(1);
      I$push(out, [ 48, '', false, digits ]);
      i = j - 1;
      continue;
    }
    I$push(out, [ l, '', upper ]);
  }
  return out;
};
const I$primaryRank = c => {
  if (I$isSpaceOrPunct(c)) return c;
  if (c >= 48 && c <= 57) return 0x10000 + c;
  return 0x20000 + c;
};
const I$compareStrings = (o, x, y) => {
  if (x === y) return 0;
  const a = I$collationElements(o, x), b = I$collationElements(o, y);
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    const pa = I$primaryRank(a[i][0]), pb = I$primaryRank(b[i][0]);
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a[i][3] !== undefined && b[i][3] !== undefined && a[i][3] !== b[i][3]) {
      const da = a[i][3], db = b[i][3];
      if (da.length !== db.length) return da.length < db.length ? -1 : 1;
      return da < db ? -1 : 1;
    }
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  const sens = o.sensitivity;
  if (sens === 'accent' || sens === 'variant') {
    for (let i = 0; i < n; i++) if (a[i][1] !== b[i][1]) return a[i][1] < b[i][1] ? -1 : 1;
  }
  if (sens === 'case' || sens === 'variant') {
    for (let i = 0; i < n; i++) {
      if (a[i][2] !== b[i][2]) {
        const upperFirst = o.caseFirst === 'upper';
        return a[i][2] === upperFirst ? -1 : 1;
      }
    }
  }
  return 0;
};
const I$collatorLocaleData = (locale, key) => {
  if (key === 'co') {
    const r = I$tagInfo(locale);
    const extra = { ar: 'compat', de: 'phonebk', es: 'trad', ko: 'searchjl', ln: 'phonetic', si: 'dict', zh: 'pinyin,stroke,unihan,zhuyin' }[r.lang];
    let list = [ null, 'emoji', 'eor' ];
    if (extra) list = list.concat(I$splitStr(extra, ','));
    return list;
  }
  if (key === 'kf') return [ 'false', 'lower', 'upper' ];
  if (key === 'kn') return [ 'false', 'true' ];
  return [];
};
const I$Collator = function Collator(locales, options) {
  const c = new.target === undefined ? I$objCreate(Collator.prototype) : this;
  const requested = I$canonicalizeLocaleList(locales);
  options = I$coerceOptionsToObject(options);
  const o = { locale: '', dataLocale: '', usage: '', sensitivity: '', ignorePunctuation: false, collation: '', numeric: false, caseFirst: '', boundCompare: undefined };
  o.usage = I$getOption(options, 'usage', 'string', [ 'sort', 'search' ], 'sort');
  const opt = { localeMatcher: I$getLocaleMatcher(options), co: I$getUTypeOption(options, 'collation'), kn: undefined, kf: undefined };
  let numeric = I$getOption(options, 'numeric', 'boolean', undefined, undefined);
  if (numeric !== undefined) numeric = String(numeric);
  opt.kn = numeric;
  opt.kf = I$getOption(options, 'caseFirst', 'string', [ 'upper', 'lower', 'false' ], undefined);
  const r = I$resolveLocale(requested, opt, [ 'co', 'kf', 'kn' ], I$collatorLocaleData);
  o.locale = r.locale;
  o.dataLocale = I$tagInfo(r.dataLocale).lang;
  o.collation = r.co === null ? 'default' : r.co;
  o.numeric = r.kn === 'true';
  o.caseFirst = r.kf;
  const sensitivity = I$getOption(options, 'sensitivity', 'string', [ 'base', 'accent', 'case', 'variant' ], undefined);
  o.sensitivity = sensitivity === undefined ? 'variant' : sensitivity;
  const ip = I$getOption(options, 'ignorePunctuation', 'boolean', undefined, undefined);
  o.ignorePunctuation = ip === undefined ? o.dataLocale === 'th' : ip;
  I$setSlots(c, 'an Intl.Collator', o);
  return c;
};
I$defineService(I$Collator, 0, 'Collator', {
  get compare() {
    const o = I$thisSlots(this, 'an Intl.Collator');
    if (o.boundCompare === undefined) o.boundCompare = (x, y) => I$compareStrings(o, I$toStr(x), I$toStr(y));
    return o.boundCompare;
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.Collator');
    return {
      locale: o.locale, usage: o.usage, sensitivity: o.sensitivity, ignorePunctuation: o.ignorePunctuation, collation: o.collation,
      numeric: o.numeric, caseFirst: o.caseFirst
    };
  }
});

const I$MONTHS_LONG = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ];
const I$MONTHS_SHORT = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
const I$DAYS_LONG = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ];
const I$DAYS_SHORT = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
const I$DTF_COMPONENTS = [
  [ 'weekday', [ 'narrow', 'short', 'long' ] ],
  [ 'era', [ 'narrow', 'short', 'long' ] ],
  [ 'year', [ '2-digit', 'numeric' ] ],
  [ 'month', [ '2-digit', 'numeric', 'narrow', 'short', 'long' ] ],
  [ 'day', [ '2-digit', 'numeric' ] ],
  [ 'dayPeriod', [ 'narrow', 'short', 'long' ] ],
  [ 'hour', [ '2-digit', 'numeric' ] ],
  [ 'minute', [ '2-digit', 'numeric' ] ],
  [ 'second', [ '2-digit', 'numeric' ] ],
  [ 'fractionalSecondDigits', null ],
  [ 'timeZoneName', [ 'short', 'long', 'shortOffset', 'longOffset', 'shortGeneric', 'longGeneric' ] ]
];
const I$dtfLocaleData = (locale, key) => {
  if (key === 'ca') return I$caValues();
  if (key === 'nu') return I$nuValues();
  if (key === 'hc') return I$HC_VALUES;
  return I$NO_VALUES;
};
const I$localeHourCycle = I$memo(dataLocale => {
  const r = I$tagInfo(dataLocale);
  const region = r.region ? I$asciiUpper(r.region) : I$addLikely(r.lang, r.script, '')[2];
  return I$REGION_HOUR12[region] !== undefined ? 'h12' : 'h23';
});
const I$parseOffsetZone = s => {
  const sign = s[0];
  if (sign !== '+' && sign !== '-' && sign !== '\u2212') return null;
  let rest = s.slice(1), h, m = 0;
  if (rest.length === 2 && I$allDigit(rest)) h = +rest;
  else if (rest.length === 4 && I$allDigit(rest)) {
    h = +rest.slice(0, 2);
    m = +rest.slice(2);
  } else if (rest.length === 5 && rest[2] === ':' && I$allDigit(rest.slice(0, 2)) && I$allDigit(rest.slice(3))) {
    h = +rest.slice(0, 2);
    m = +rest.slice(3);
  } else return undefined;
  if (h > 23 || m > 59) return undefined;
  const v = h * 60 + m;
  return sign === '+' ? v : -v;
};
const I$isOffsetLike = s => s.length > 0 && (s[0] === '+' || s[0] === '-' || s[0] === '\u2212');
const I$pad2 = n => n < 10 ? '0' + n : '' + n;
const I$formatOffsetId = mins => {
  const sign = mins < 0 ? '-' : '+';
  if (mins < 0) mins = -mins;
  return sign + I$pad2(Math.floor(mins / 60)) + ':' + I$pad2(mins % 60);
};
const I$resolveTimeZone = I$memo(tz => {
  if (I$isOffsetLike(tz)) {
    const m = I$parseOffsetZone(tz);
    if (m === null || m === undefined || tz[0] === '\u2212') throw new RangeError('Invalid time zone specified: ' + tz);
    return { id: I$formatOffsetId(m), offset: m };
  }
  const lower = I$asciiLower(tz);
  const name = lower === null ? undefined : I$zoneData().lower[lower];
  if (name === undefined) throw new RangeError('Invalid time zone specified: ' + tz);
  let off = 0;
  if (name.slice(0, 7) === 'Etc/GMT' && name.length > 7) off = -60 * +name.slice(7);
  return { id: name, offset: off };
});
const I$newDtfSlots = () => ({
  locale: '', dataLocale: '', calendar: '', numberingSystem: '', timeZone: '', tzOffset: 0, hourCycle: undefined,
  weekday: undefined, era: undefined, year: undefined, month: undefined, day: undefined, dayPeriod: undefined, hour: undefined,
  minute: undefined, second: undefined, fractionalSecondDigits: undefined, timeZoneName: undefined, dateStyle: undefined, timeStyle: undefined,
  boundFormat: undefined, hc: undefined, explicit: undefined
});
// mimics the en best fit patterns
const I$bestFitComponents = (fmt, hc) => {
  if (fmt.hour !== undefined) {
    if (hc === 'h23' || hc === 'h24') fmt.hour = '2-digit';
    if (fmt.minute !== undefined) fmt.minute = '2-digit';
  }
  if (fmt.minute !== undefined && (fmt.second !== undefined || fmt.fractionalSecondDigits !== undefined)) {
    fmt.minute = '2-digit';
    fmt.second = '2-digit';
  }
  if (fmt.hour !== undefined && fmt.minute !== undefined && fmt.second !== undefined) fmt.second = '2-digit';
};
const I$createDateTimeFormat = (locales, options, required, defaults, toLocaleStringTimeZone) => {
  const requested = I$canonicalizeLocaleList(locales);
  options = I$coerceOptionsToObject(options);
  const o = I$newDtfSlots();
  const opt = { localeMatcher: I$getLocaleMatcher(options), ca: I$getUTypeOption(options, 'calendar'), nu: I$getUTypeOption(options, 'numberingSystem'), hc: undefined };
  const hour12 = I$getOption(options, 'hour12', 'boolean', undefined, undefined);
  let hourCycle = I$getOption(options, 'hourCycle', 'string', [ 'h11', 'h12', 'h23', 'h24' ], undefined);
  if (hour12 !== undefined) hourCycle = null;
  opt.hc = hourCycle;
  const r = I$resolveLocale(requested, opt, [ 'ca', 'hc', 'nu' ], I$dtfLocaleData);
  o.locale = r.locale;
  o.dataLocale = r.dataLocale;
  o.calendar = r.ca;
  o.numberingSystem = r.nu;
  let hc;
  const hcDefault = I$localeHourCycle(r.dataLocale);
  if (hour12 === true) hc = I$tagInfo(r.dataLocale).lang === 'ja' ? 'h11' : 'h12';
  else if (hour12 === false) hc = 'h23';
  else {
    hc = r.hc;
    if (hc === null || hc === undefined) hc = hcDefault;
  }
  let timeZone = options.timeZone;
  if (toLocaleStringTimeZone !== undefined) {
    // Temporal.ZonedDateTime.prototype.toLocaleString formats in its own time zone
    if (timeZone !== undefined) throw new TypeError('timeZone option is not allowed when formatting a Temporal.ZonedDateTime');
    timeZone = toLocaleStringTimeZone;
  } else if (timeZone === undefined) timeZone = 'UTC';
  else timeZone = I$toStr(timeZone);
  const tz = I$resolveTimeZone(timeZone);
  o.timeZone = tz.id;
  o.tzOffset = tz.offset;
  o.hc = hc;
  let fmt = I$objCreate(null), hasExplicit = false;
  for (let i = 0; i < I$DTF_COMPONENTS.length; i++) {
    let prop = I$DTF_COMPONENTS[i][0], value;
    if (prop === 'fractionalSecondDigits') value = I$getNumberOption(options, 'fractionalSecondDigits', 1, 3, undefined);
    else value = I$getOption(options, prop, 'string', I$DTF_COMPONENTS[i][1], undefined);
    fmt[prop] = value;
    if (value !== undefined) hasExplicit = true;
  }
  o.explicit = I$objCreate(null);
  for (let i = 0; i < I$DTF_COMPONENTS.length; i++) o.explicit[I$DTF_COMPONENTS[i][0]] = fmt[I$DTF_COMPONENTS[i][0]];
  I$getOption(options, 'formatMatcher', 'string', [ 'basic', 'best fit' ], 'best fit');
  const dateStyle = I$getOption(options, 'dateStyle', 'string', [ 'full', 'long', 'medium', 'short' ], undefined);
  const timeStyle = I$getOption(options, 'timeStyle', 'string', [ 'full', 'long', 'medium', 'short' ], undefined);
  o.dateStyle = dateStyle;
  o.timeStyle = timeStyle;
  if (dateStyle !== undefined || timeStyle !== undefined) {
    if (hasExplicit) throw new TypeError('Can\'t set option ' + (dateStyle !== undefined ? 'dateStyle' : 'timeStyle') + ' when other date/time components are set');
    if (required === 'date' && timeStyle !== undefined) throw new TypeError('Invalid option : timeStyle');
    if (required === 'time' && dateStyle !== undefined) throw new TypeError('Invalid option : dateStyle');
    if (timeStyle !== undefined) o.hourCycle = hc;
    return o;
  }
  let needDefaults = true;
  if (required === 'date' || required === 'any') {
    if (fmt.weekday !== undefined || fmt.year !== undefined || fmt.month !== undefined || fmt.day !== undefined) needDefaults = false;
  }
  if (required === 'time' || required === 'any') {
    if (fmt.dayPeriod !== undefined || fmt.hour !== undefined || fmt.minute !== undefined || fmt.second !== undefined || fmt.fractionalSecondDigits !== undefined) needDefaults = false;
  }
  if (needDefaults && (defaults === 'date' || defaults === 'all')) {
    fmt.year = 'numeric';
    fmt.month = 'numeric';
    fmt.day = 'numeric';
  }
  if (needDefaults && (defaults === 'time' || defaults === 'all')) {
    fmt.hour = 'numeric';
    fmt.minute = 'numeric';
    fmt.second = 'numeric';
  }
  I$bestFitComponents(fmt, hc);
  if (fmt.hour !== undefined) o.hourCycle = hc;
  for (let i = 0; i < I$DTF_COMPONENTS.length; i++) o[I$DTF_COMPONENTS[i][0]] = fmt[I$DTF_COMPONENTS[i][0]];
  return o;
};
const I$DateTimeFormat = function DateTimeFormat(locales, options) {
  return I$legacyConstruct(DateTimeFormat, new.target, this, 'an Intl.DateTimeFormat', I$createDateTimeFormat(locales, options, 'any', 'date'));
};
const I$timeClip = t => {
  if (t !== t || t === Infinity || t === -Infinity || Math.abs(t) > 8.64e15) return NaN;
  return Math.trunc(t) + 0;
};
const I$toDateValue = date => {
  let x = date === undefined ? Date.now() : I$toNum(date);
  x = I$timeClip(x);
  if (x !== x) throw new RangeError('Invalid time value');
  return x;
};
const I$dateFields = (t, offsetMin) => {
  t += offsetMin * 60000;
  const days = Math.floor(t / 86400000), ms = t - days * 86400000;
  const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y++;
  let wd = (days + 4) % 7;
  if (wd < 0) wd += 7;
  return {
    year: y, month: m, day: d, weekday: wd, hour: Math.floor(ms / 3600000), minute: Math.floor(ms / 60000) % 60,
    second: Math.floor(ms / 1000) % 60, ms: ms % 1000
  };
};
const I$posMod = (a, b) => {
  const r = a % b;
  return r < 0 ? r + b : r;
};
const I$civilOf = days => {
  const f = I$dateFields(days * 86400000, 0);
  return [ f.year, f.month, f.day ];
};
const I$JP_ERAS = [ [ 2019, 5, 1, 'Reiwa', 'R' ], [ 1989, 1, 8, 'Heisei', 'H' ], [ 1926, 12, 25, 'Shōwa', 'S' ], [ 1912, 7, 30, 'Taishō', 'T' ], [ 1868, 9, 8, 'Meiji', 'M' ] ];
// arithmetic islamic calendar, epoch day of 1 Muharram 1 AH given
const I$islamicStart = (y, epoch) => epoch + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30);
const I$islamicFromDays = (days, epoch) => {
  let y = Math.floor((30 * (days - epoch) + 10646) / 10631), m = 1;
  if (I$islamicStart(y + 1, epoch) <= days) y++;
  else if (I$islamicStart(y, epoch) > days) y--;
  let start = I$islamicStart(y, epoch), doy = days - start;
  while (m < 12 && doy >= 30 - ((m - 1) & 1)) {
    doy -= 30 - ((m - 1) & 1);
    m++;
  }
  return [ y, m, doy + 1 ];
};
const I$UMQ_START = -31826, I$UMQ_BITS = '5552ab9372b657636cb55aaa95649e95d2ba5b53aab4ba9652e2ad56db5a752f25e8ad16a56ab56b4da9b92b2564ba9b35a6d95d4da5d4aa955369752f46e96d46a953525d4bd9ba3b4b69b2aa554ada5d2da6d9eaae94d2ac564aea6d56ad55d4aa9352ba5b53a6b5ea9d52d29a554ad56daea6e4ed1da2aaa95a2da5b9bb27646c95552ab4dbaba5b4da9d52aa592d26d8ed2daad5aa5a4b4979372b6975d69d52c9592b25b4db9d55d2da5d4aa9554daad3aabd2bc4b89a9552d5adb6a6d4dc9d92aa69562ae56d36ab55aaa94d49d95d2ba5b55aad55a9a92e26e55dada6d46a5b27a4d4ad56db5a754f49e92d26a563566b5baab92b2568ba9b55aada5b4da9b52a9a536276575af26d46a95552ad4bd9ba574b69b52a9552da5d4daad96b2e95e2ac9692eaad56ad65d4ad1562bc5b53a6b5db2d64d29a554ad96daea6e8ed1da4d4aa6a2da5b9b72b686d16554ab95b2ba5b5da9d52ca694e46e95d4daad5aaaa4d49b9374b6975d6ad52aa594b2ab55bad95d2dc5d92b25555ab55b4ba97a2745593aab4d69d65d2ba5b4aa954ad15d2dd9da5b45a952d25b8b717656db6aacaa9652b15b2bb5b6daab94d46a8d52da9d55a755749f13e4aa965566b5baab94';
const I$umalquraFromDays = days => {
  if (days < I$UMQ_START) return I$islamicFromDays(days, -492148);
  let start = I$UMQ_START;
  for (let i = 0; i < I$UMQ_BITS.length; i += 3) {
    let bits = parseInt(I$UMQ_BITS.slice(i, i + 3), 16), lens = [], tot = 0;
    for (let m = 0; m < 12; m++) {
      lens[m] = bits >> m & 1 ? 30 : 29;
      tot += lens[m];
    }
    if (days < start + tot) {
      let doy = days - start, m = 0;
      while (doy >= lens[m]) {
        doy -= lens[m];
        m++;
      }
      return [ 1300 + i / 3, m + 1, doy + 1 ];
    }
    start += tot;
  }
  return I$islamicFromDays(days, -492148);
};
const I$copticFromDays = (days, epoch) => {
  const y = Math.floor((4 * (days - epoch) + 1463) / 1461);
  const start = epoch + 365 * (y - 1) + Math.floor(y / 4), doy = days - start;
  return [ y, Math.floor(doy / 30) + 1, doy % 30 + 1 ];
};
const I$hebrewElapsed = y => {
  const months = Math.floor((235 * y - 234) / 19), day = 29 * months + Math.floor((12084 + 13753 * months) / 25920);
  return I$posMod(3 * (day + 1), 7) < 3 ? day + 1 : day;
};
const I$hebrewNewYear = y => {
  const e0 = I$hebrewElapsed(y - 1), e1 = I$hebrewElapsed(y), e2 = I$hebrewElapsed(y + 1);
  return -2092590 + e1 + (e2 - e1 === 356 ? 2 : e1 - e0 === 382 ? 1 : 0);
};
const I$hebrewFromDays = days => {
  let y = Math.floor((days + 2092590) / 365.2468) + 1;
  while (I$hebrewNewYear(y) > days) y--;
  while (I$hebrewNewYear(y + 1) <= days) y++;
  const start = I$hebrewNewYear(y), len = I$hebrewNewYear(y + 1) - start, leap = I$posMod(7 * y + 1, 19) < 7;
  const lens = [ 30, len % 10 === 5 ? 30 : 29, len % 10 === 3 ? 29 : 30, 29, 30, leap ? 30 : 0, 29, 30, 29, 30, 29, 30, 29 ];
  let doy = days - start, m = 0;
  while (doy >= lens[m]) {
    doy -= lens[m];
    m++;
  }
  return [ y, m + 1, doy + 1, leap ];
};
const I$daysFromCivil = (y, m, d) => {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};
const I$indianFromDays = days => {
  let g = I$civilOf(days), gy = g[0];
  const start = gy => {
    const leap = gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0);
    return I$daysFromCivil(gy, 3, leap ? 21 : 22);
  };
  if (days < start(gy)) gy--;
  let leap = gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0), doy = days - start(gy), m = 0;
  const lens = [ leap ? 31 : 30, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30 ];
  while (doy >= lens[m]) {
    doy -= lens[m];
    m++;
  }
  return [ gy - 78, m + 1, doy + 1 ];
};
// arithmetic (33-year cycle) persian calendar, as in ICU
const I$persianFromDays = days => {
  const d = days + 492268, y = 1 + Math.floor((33 * d + 3) / 12053);
  const doy = d - (365 * (y - 1) + Math.floor((8 * y + 21) / 33));
  const m = doy < 216 ? Math.floor(doy / 31) : Math.floor((doy - 6) / 30);
  return [ y, m + 1, doy - (m < 6 ? m * 31 : m * 30 + 6) + 1 ];
};
const I$CHINESE_DATA = 't00ab5j00daa961da4r00ea4g00d4a551a95o00a96c00536130ab5k00ad5a816d2t00752i00ea585164aq0064be00a9b441556n0056ac00b59121752k00752961b25s00b25g00a4b5514abo002add0056b230b69l00da9b71d92u00e92i00d25761a4dq00a56f002b63415b5n006d4c00ea9221e92k00e92960d26r0052bg00a575512b6o00b5ae006d4330ec9l00749a71693t00a93i0052b660a5bp00aadf0056a441b55n00ba4c00b49121a93k00a9587152dr00536g00aad6515aao00db2e00da4331d49m00d4aa80a95s00a97i00556760ab5p00ad5f006d2440ea5n00ea5c0064a030c97j00a9b97155ar0056ag00b69651752p00b52d00b2524164bl00a4ba814abs002adh0056d760b69q00da9f00d92441d25n00d25ca1a4du00a56j002b68705b5r006d5g00ea9651e92p00e92e00d26230a56k00a57a814d6t0035ah006d5750ec9q00749f0069334152bm0052bb00a5b12155aj0056a871b55s00ba4h00b49551a93o00a95d0052d240a6dk00ab5a915aat005d2i00da5761d4aq00e4af00c9544152em00556b00ab51215b2k006d2860ea5r00f25h0064a550c97n004abc0055b230ad6l00b69ab1752t00b52i00b25761a4bp00a4be004ab35055bm005adb00b6a121b52k00d92971d25r00d25g00a555514ado004b6c005b5230daal00ec9b81e92t00e92i00d26760a56p00a57e004d63406d5m00755c00749030e93j0069387152br0052bf00a5b55155ao0056ad00b6524174al00b49a81a95t00a95h0052d660aadp00ab5f005aa340ba5m00da5c00d4a131c95j00c9687194er00556g00ab55515b2o006d2d00ea5340e4ak0068b980c97s004abh0055b660ad6p00b6af00752441725m00b45b00a8b02149bj004ab87096br005adh00baa751b52p00d92e00d25341a4bm00a55a914adt004b6';
const I$DANGI_DIFF = '1897:c00556,1914:55129b,1915:o00aad,1916:e0056a,1917:220b69,1918:l00ba9,1919:b71b52,1920:u00d92,1922:751a4d,1923:q00956,1924:f002b5,1925:3415ad,1927:c00da9,1928:221d92,1931:r00527,1934:o00ada,1936:330ea9,1942:p0096d,1943:f00b6a,1944:541b54,1949:87152b,1950:r0052d,1952:65156a,1957:a81a95,1958:t00a96,1965:c00e4a,1966:130c96,1968:971556,1970:g00b59,1972:p00752,1973:d00725,1976:a812ab,1978:h0056b,1982:441b25,1987:8615ad,1988:s006d4,1989:g00da9,1990:651d92,1995:a812b6,1996:t00b5a,1997:i006d4,2001:341527,2005:j0036a,2012:230a5d,2013:k00aad,2017:751d49,2018:q00d4a,2019:f00a95,2020:44152d,2023:1215aa,2026:r00ea5,2027:h00e4a,2028:650c96,2029:n00c9b,2030:d0055a,2031:230ad5,2034:t00752,2036:76164b,2040:m0056d,2041:b00b69,2046:g00a4d,2048:o002b6,2050:230da9,2051:l00dc9,2052:b81d92,2058:3406b5,2059:m006d5,2060:c00ec9,2061:130e92,2068:d00b55,2069:241749,2071:a81a93,2080:131a95,2081:j00c95,2082:87152e,2088:341e4a,2089:l0064a,2091:s00cab,2092:i0055a,2093:660ad5,2094:p00b69,2096:440ea5,2097:m00b25,2098:b0064b,2099:031497,2101:87055b,2103:h00b69';
let I$dangiData;
const I$lunisolarYear = (cal, y) => {
  let data = I$CHINESE_DATA;
  if (cal === 'dangi') {
    if (I$dangiData === undefined) {
      I$dangiData = I$CHINESE_DATA;
      const diffs = I$splitStr(I$DANGI_DIFF, ',');
      for (let i = 0; i < diffs.length; i++) {
        const at = (+diffs[i].slice(0, 4) - 1890) * 6;
        I$dangiData = I$dangiData.slice(0, at) + diffs[i].slice(5) + I$dangiData.slice(at + 6);
      }
    }
    data = I$dangiData;
  }
  const s = data.slice((y - 1890) * 6, (y - 1890) * 6 + 6);
  return [ I$daysFromCivil(y, 1, 21) + parseInt(s[0], 36), parseInt(s[1], 36), parseInt(s.slice(2), 16) ];
};
const I$lunisolarFromDays = (cal, days) => {
  // outside the table, shift by whole metonic cycles (235 mean lunations)
  let shift = 0;
  if (days < I$lunisolarYear(cal, 1890)[0] || days >= I$lunisolarYear(cal, 2110)[0]) shift = Math.floor((days - 10957) / 6939.688);
  let d = days - Math.round(shift * 6939.688), g = I$civilOf(d)[0], ys = I$lunisolarYear(cal, g);
  if (d < ys[0]) ys = I$lunisolarYear(cal, --g);
  let doy = d - ys[0], n = ys[1] ? 13 : 12, num = 0, leap = false;
  for (let i = 0; i < n; i++) {
    const len = ys[2] >> i & 1 ? 30 : 29;
    if (ys[1] && i === ys[1]) leap = true;
    else {
      leap = false;
      num++;
    }
    if (doy < len) break;
    doy -= len;
  }
  return [ g + shift * 19, num, doy + 1, leap ];
};
const I$calendarDate = (cal, days) => {
  const g = I$civilOf(days);
  if (cal === 'buddhist') return { year: g[0] + 543, era: 'BE', month: g[1], day: g[2] };
  if (cal === 'roc') return g[0] > 1911 ? { year: g[0] - 1911, era: 'Minguo', month: g[1], day: g[2] } : { year: 1912 - g[0], era: 'B.R.O.C.', month: g[1], day: g[2] };
  if (cal === 'japanese') {
    for (let i = 0; i < I$JP_ERAS.length; i++) {
      const e = I$JP_ERAS[i];
      if (days >= I$daysFromCivil(e[0], e[1], e[2])) return { year: g[0] - e[0] + 1, era: e[3], narrowEra: e[4], month: g[1], day: g[2] };
    }
    return g[0] > 0 ? { year: g[0], era: 'AD', month: g[1], day: g[2] } : { year: 1 - g[0], era: 'BC', month: g[1], day: g[2] };
  }
  if (cal === 'islamic-civil' || cal === 'islamic-tbla' || cal === 'islamic-umalqura') {
    const r = cal === 'islamic-umalqura' ? I$umalquraFromDays(days) : I$islamicFromDays(days, cal === 'islamic-civil' ? -492148 : -492149);
    return r[0] > 0 ? { year: r[0], era: 'AH', month: r[1], day: r[2] } : { year: 1 - r[0], era: 'BH', month: r[1], day: r[2] };
  }
  if (cal === 'coptic') {
    const r = I$copticFromDays(days, -615558);
    return { year: r[0], era: 'ERA1', month: r[1], day: r[2] };
  }
  if (cal === 'ethiopic' || cal === 'ethioaa') {
    const r = I$copticFromDays(days, -716367);
    return cal === 'ethiopic' && r[0] > 0 ? { year: r[0], era: 'ERA1', month: r[1], day: r[2] } : { year: r[0] + 5500, era: 'ERA0', month: r[1], day: r[2] };
  }
  if (cal === 'hebrew') {
    const r = I$hebrewFromDays(days);
    return { year: r[0], era: 'AM', month: r[1], day: r[2], leap: r[3] };
  }
  if (cal === 'indian') {
    const r = I$indianFromDays(days);
    return { year: r[0], era: 'Saka', month: r[1], day: r[2] };
  }
  if (cal === 'persian') {
    const r = I$persianFromDays(days);
    return { year: r[0], era: 'AP', month: r[1], day: r[2] };
  }
  if (cal === 'chinese' || cal === 'dangi') {
    const r = I$lunisolarFromDays(cal, days);
    return { year: r[0], related: true, month: r[1], day: r[2], leap: r[3] };
  }
  return null;
};
const I$CAL_MONTHS = {
  islamic: [ 'Muharram,Safar,Rabiʻ I,Rabiʻ II,Jumada I,Jumada II,Rajab,Shaʻban,Ramadan,Shawwal,Dhuʻl-Qiʻdah,Dhuʻl-Hijjah', 'Muh.,Saf.,Rab. I,Rab. II,Jum. I,Jum. II,Raj.,Sha.,Ram.,Shaw.,Dhuʻl-Q.,Dhuʻl-H.' ],
  coptic: [ 'Tout,Baba,Hator,Kiahk,Toba,Amshir,Baramhat,Baramouda,Bashans,Paona,Epep,Mesra,Nasie' ],
  ethiopic: [ 'Meskerem,Tekemt,Hedar,Tahsas,Ter,Yekatit,Megabit,Miazia,Genbot,Sene,Hamle,Nehasse,Pagumen' ],
  hebrew: [ 'Tishri,Heshvan,Kislev,Tevet,Shevat,Adar I,Adar,Nisan,Iyar,Sivan,Tamuz,Av,Elul' ],
  indian: [ 'Chaitra,Vaisakha,Jyaistha,Asadha,Sravana,Bhadra,Asvina,Kartika,Agrahayana,Pausa,Magha,Phalguna' ],
  persian: [ 'Farvardin,Ordibehesht,Khordad,Tir,Mordad,Shahrivar,Mehr,Aban,Azar,Dey,Bahman,Esfand' ]
};
const I$LUNAR_ORDINALS = 'First,Second,Third,Fourth,Fifth,Sixth,Seventh,Eighth,Ninth,Tenth,Eleventh,Twelfth';
const I$calMonthName = (calendar, x, width) => {
  if (calendar === 'chinese' || calendar === 'dangi') {
    if (width === 'narrow') return x.month + (x.leap ? 'b' : '');
    if (width === 'short') return 'Mo' + x.month + (x.leap ? 'bis' : '');
    return I$splitStr(I$LUNAR_ORDINALS, ',')[x.month - 1] + ' Month' + (x.leap ? 'bis' : '');
  }
  if (width === 'narrow') return String(x.month);
  if (calendar === 'hebrew' && x.month === 7 && x.leap) return 'Adar II';
  const key = calendar.slice(0, 7) === 'islamic' ? 'islamic' : calendar === 'ethioaa' ? 'ethiopic' : calendar;
  const names = I$CAL_MONTHS[key];
  return I$splitStr(names[width === 'short' && names.length > 1 ? 1 : 0], ',')[x.month - 1];
};
const I$yearName = (y, zh) => {
  const stem = I$posMod(y - 4, 10), branch = I$posMod(y - 4, 12);
  if (zh) return '甲乙丙丁戊己庚辛壬癸'[stem] + '子丑寅卯辰巳午未申酉戌亥'[branch];
  return I$splitStr('jia,yi,bing,ding,wu,ji,geng,xin,ren,gui', ',')[stem] + '-' + I$splitStr('zi,chou,yin,mao,chen,si,wu,wei,shen,you,xu,hai', ',')[branch];
};
const I$dayPeriodName = (h, m, width) => {
  if (h === 12 && m === 0) return width === 'narrow' ? 'n' : 'noon';
  if (h >= 6 && h < 12) return 'in the morning';
  if (h >= 12 && h < 18) return 'in the afternoon';
  if (h >= 18 && h < 21) return 'in the evening';
  return 'at night';
};
const I$tzName = (o, style) => {
  const off = o.tzOffset;
  if (o.timeZone === 'UTC' || o.timeZone === 'Etc/UTC' || o.timeZone === 'Etc/GMT' || o.timeZone === 'GMT') {
    if (style === 'short') return 'UTC';
    if (style === 'long') return 'Coordinated Universal Time';
  }
  if (off === 0) return 'GMT';
  const sign = off < 0 ? '-' : '+', a = off < 0 ? -off : off, h = Math.floor(a / 60), m = a % 60;
  if (style === 'long' || style === 'longOffset' || style === 'longGeneric') return 'GMT' + sign + I$pad2(h) + ':' + I$pad2(m);
  return 'GMT' + sign + h + (m ? ':' + I$pad2(m) : '');
};
const I$numStr = (o, n, twoDigit) => {
  let s = String(n);
  if (twoDigit && s.length < 2) s = '0' + s;
  return I$transliterate(o, s);
};
const I$NUMERIC_DATES = I$table('de=d.m.y,fr=d/m/y,es=d/m/y,it=d/m/y,ja=y/m/d,ko=y. m. d.,zh=y/m/d,pt=d/m/y,nl=d-m-y,ru=d.m.y,pl=d.m.y,sv=y-m-d,en-GB=d/m/y,en-IN=d/m/y,en-AU=d/m/y,en-NZ=d/m/y,en-IE=d/m/y,en-ZA=y/m/d,hi=d/m/y,tr=d.m.y,th=d/m/y,id=d/m/y,vi=d/m/y,uk=d.m.y,cs=d. m. y,sk=d. m. y,da=d.m.y,fi=d.m.y,nb=d.m.y,no=d.m.y,he=d.m.y,el=d/m/y,hu=y. m. d.,ro=d.m.y,bg=d.m.y,hr=d. m. y.,sl=d. m. y,lt=y-m-d,lv=d.m.y,et=d.m.y,ca=d/m/y,eu=y/m/d,gl=d/m/y', ',', '=');
const I$numericDatePattern = dataLocale => {
  const r = I$tagInfo(dataLocale), t = I$NUMERIC_DATES;
  if (r.region && t[r.lang + '-' + I$asciiUpper(r.region)] !== undefined) return t[r.lang + '-' + I$asciiUpper(r.region)];
  return t[r.lang] !== undefined ? t[r.lang] : 'm/d/y';
};
const I$STYLE_DATE = {
  full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  short: { month: 'numeric', day: 'numeric', year: '2-digit' }
};
const I$STYLE_TIME = {
  full: { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'long' },
  long: { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' },
  medium: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  short: { hour: 'numeric', minute: '2-digit' }
};
const I$dtfComponents = o => {
  const c = I$objCreate(null);
  for (let i = 0; i < I$DTF_COMPONENTS.length; i++) c[I$DTF_COMPONENTS[i][0]] = o[I$DTF_COMPONENTS[i][0]];
  if (o.dateStyle !== undefined || o.timeStyle !== undefined) {
    let src = o.dateStyle !== undefined ? I$STYLE_DATE[o.dateStyle] : null;
    if (src) for (const k in src) c[k] = src[k];
    src = o.timeStyle !== undefined ? I$STYLE_TIME[o.timeStyle] : null;
    if (src) {
      for (const k in src) c[k] = src[k];
      if (o.hc === 'h23' || o.hc === 'h24') c.hour = '2-digit';
    }
  }
  return c;
};
const I$dtParts = (o, v) => {
  const c = v.c, f = I$dateFields(v.t, v.offset), out = [];
  const add = (type, value, group) => {
    const p = I$part(type, value);
    p.group = group;
    I$push(out, p);
  };
  let calendar = o.calendar, x = null;
  if (calendar !== 'gregory' && calendar !== 'iso8601') x = I$calendarDate(calendar, I$daysFromCivil(f.year, f.month, f.day));
  const lunar = x !== null && x.related === true, hebrew = calendar === 'hebrew', gregMonths = x === null || x.era === 'AD' || x.era === 'BC' || calendar === 'buddhist' || calendar === 'roc' || calendar === 'japanese';
  const year = x !== null ? x.year : f.year <= 0 && c.era !== undefined ? 1 - f.year : f.year;
  const month = x !== null ? x.month : f.month, day = x !== null ? x.day : f.day;
  const hasDate = c.weekday !== undefined || c.year !== undefined || c.month !== undefined || c.day !== undefined || c.era !== undefined;
  // the hebrew calendar always spells out its months
  const monthWidth = hebrew && (c.month === 'numeric' || c.month === '2-digit') ? 'long' : c.month;
  const textMonth = monthWidth === 'long' || monthWidth === 'short' || monthWidth === 'narrow';
  const yearStr = c.year === '2-digit' ? I$numStr(o, (year % 100 + 100) % 100, true) : I$transliterate(o, String(year));
  // non-gregorian calendars other than hebrew and the lunisolar ones show their era with the year
  const showEra = !lunar && (c.era !== undefined || (x !== null && !hebrew && c.year !== undefined));
  const eraWidth = c.era !== undefined ? c.era : textMonth || c.month === undefined ? 'long' : 'narrow';
  let bc = x !== null ? x.era === 'BC' : f.year <= 0, eraStr;
  if (x === null || x.era === 'AD' || x.era === 'BC') eraStr = eraWidth === 'long' ? (bc ? 'Before Christ' : 'Anno Domini') : eraWidth === 'narrow' ? (bc ? 'B' : 'A') : (bc ? 'BC' : 'AD');
  else eraStr = eraWidth === 'narrow' && x.narrowEra !== undefined ? x.narrowEra : x.era;
  const addYear = () => {
    if (!lunar) return add('year', yearStr, 'date');
    add('relatedYear', I$transliterate(o, String(year)), 'date');
    const zh = I$tagInfo(o.dataLocale).lang === 'zh';
    if (zh ? c.month === undefined && c.day === undefined : c.month === undefined || c.month === 'long') {
      if (zh) {
        add('yearName', I$yearName(year, true), 'date');
        add('literal', '年', 'date');
      } else {
        add('literal', '(', 'date');
        add('yearName', I$yearName(year, false), 'date');
        add('literal', ')', 'date');
      }
    }
  };
  const monthText = () => {
    if (gregMonths) return monthWidth === 'long' ? I$MONTHS_LONG[month - 1] : monthWidth === 'short' ? I$MONTHS_SHORT[month - 1] : I$MONTHS_LONG[month - 1][0];
    return I$calMonthName(calendar, x, monthWidth);
  };
  const monthNum = () => {
    const m = I$numStr(o, month, c.month === '2-digit');
    return lunar && x.leap ? m + 'bis' : m;
  };
  if (hasDate) {
    if (c.weekday !== undefined) {
      const wd = c.weekday === 'long' ? I$DAYS_LONG[f.weekday] : c.weekday === 'short' ? I$DAYS_SHORT[f.weekday] : I$DAYS_LONG[f.weekday][0];
      add('weekday', wd, 'date');
      if (c.year !== undefined || c.month !== undefined || c.day !== undefined) add('literal', ', ', 'date');
    }
    if (textMonth && hebrew) {
      if (c.day !== undefined) {
        add('day', I$numStr(o, day, c.day === '2-digit'), 'date');
        add('literal', ' ', 'date');
      }
      add('month', monthText(), 'date');
      if (c.year !== undefined) {
        add('literal', ' ', 'date');
        addYear();
      }
    } else if (textMonth) {
      add('month', monthText(), 'date');
      if (c.day !== undefined) {
        add('literal', ' ', 'date');
        add('day', I$numStr(o, day, c.day === '2-digit'), 'date');
      }
      if (c.year !== undefined) {
        add('literal', c.day !== undefined ? ', ' : ' ', 'date');
        addYear();
      }
    } else {
      const pat = I$numericDatePattern(o.dataLocale), fields = [];
      for (let k = 0; k < pat.length; k++) {
        const ch = pat[k];
        if (ch === 'd' || ch === 'm' || ch === 'y') I$push(fields, [ ch, '' ]);
        else fields[fields.length - 1][1] += ch;
      }
      const shown = [];
      for (let k = 0; k < fields.length; k++) {
        const fc = fields[k][0];
        if ((fc === 'd' && c.day !== undefined) || (fc === 'm' && c.month !== undefined) || (fc === 'y' && c.year !== undefined)) I$push(shown, k);
      }
      for (let k = 0; k < shown.length; k++) {
        const fld = fields[shown[k]];
        if (fld[0] === 'd') add('day', I$numStr(o, day, c.day === '2-digit'), 'date');
        else if (fld[0] === 'm') add('month', monthNum(), 'date');
        else addYear();
        if ((k < shown.length - 1 || shown[k] === fields.length - 1) && fld[1] !== '') add('literal', fld[1], 'date');
      }
    }
    if (showEra) {
      add('literal', ' ', 'date');
      add('era', eraStr, 'date');
    }
  }
  const hasTime = c.hour !== undefined || c.minute !== undefined || c.second !== undefined || c.fractionalSecondDigits !== undefined || c.dayPeriod !== undefined;
  if (hasTime) {
    if (hasDate) add('literal', c.month === 'long' && c.hour !== undefined ? ' at ' : ', ', 'shared');
    let hc = o.hc, h = f.hour;
    let any = false;
    if (c.hour !== undefined) {
      if (hc === 'h11') h = h % 12;
      else if (hc === 'h12') h = h % 12 || 12;
      else if (hc === 'h24') h = h || 24;
      add('hour', I$numStr(o, h, c.hour === '2-digit'), 'time');
      any = true;
    }
    if (c.minute !== undefined) {
      if (any) add('literal', ':', 'time');
      add('minute', I$numStr(o, f.minute, c.minute === '2-digit'), 'time');
      any = true;
    }
    if (c.second !== undefined) {
      if (any) add('literal', ':', 'time');
      add('second', I$numStr(o, f.second, c.second === '2-digit'), 'time');
      any = true;
    }
    if (c.fractionalSecondDigits !== undefined) {
      if (any) add('literal', I$localeSymbols(o).decimal, 'time');
      let ms = String(f.ms);
      while (ms.length < 3) ms = '0' + ms;
      add('fractionalSecond', I$transliterate(o, ms.slice(0, c.fractionalSecondDigits)), 'time');
      any = true;
    }
    if (c.dayPeriod !== undefined) {
      if (any) add('literal', ' ', 'time');
      add('dayPeriod', I$dayPeriodName(f.hour, f.minute, c.dayPeriod), 'time');
    } else if (c.hour !== undefined && (hc === 'h11' || hc === 'h12')) {
      add('literal', ' ', 'time');
      add('dayPeriod', f.hour < 12 ? 'AM' : 'PM', 'time');
    }
  }
  if (c.timeZoneName !== undefined && v.zone) {
    add('literal', hasTime ? ' ' : ', ', 'time');
    add('timeZoneName', I$tzName(o, c.timeZoneName), 'time');
  }
  return out;
};
const I$dateValue = (o, t) => ({ kind: '', t, c: I$dtfComponents(o), offset: o.tzOffset, zone: true });
const I$formatDateTime = (o, t) => I$partsToString(I$dtParts(o, I$dateValue(o, t)));

// the Temporal polyfill registers how to recognise its objects
const I$temporalKind = x => $IntlHooks$.temporalKind === undefined ? '' : $IntlHooks$.temporalKind(x);
const I$DATE_FIELDS = [ 'weekday', 'era', 'year', 'month', 'day' ], I$TIME_FIELDS = [ 'dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits' ];
const I$temporalFields = kind => {
  if (kind === 'PlainDate') return I$DATE_FIELDS;
  if (kind === 'PlainYearMonth') return [ 'era', 'year', 'month' ];
  if (kind === 'PlainMonthDay') return [ 'month', 'day' ];
  if (kind === 'PlainTime') return I$TIME_FIELDS;
  return I$DATE_FIELDS.concat(I$TIME_FIELDS);
};
const I$temporalDefaults = kind => {
  if (kind === 'PlainDate') return [ 'year', 'month', 'day' ];
  if (kind === 'PlainYearMonth') return [ 'year', 'month' ];
  if (kind === 'PlainMonthDay') return [ 'month', 'day' ];
  if (kind === 'PlainTime') return [ 'hour', 'minute', 'second' ];
  return [ 'year', 'month', 'day', 'hour', 'minute', 'second' ];
};
const I$temporalComponents = (o, kind) => {
  const c = I$objCreate(null), rel = I$temporalFields(kind);
  if (o.dateStyle !== undefined || o.timeStyle !== undefined) {
    const hasDate = kind !== 'PlainTime' && o.dateStyle !== undefined, hasTime = (kind === 'PlainTime' || kind === 'PlainDateTime') && o.timeStyle !== undefined;
    if (!hasDate && !hasTime) throw new TypeError('Invalid format options for ' + kind);
    if (hasDate) {
      const src = I$STYLE_DATE[o.dateStyle];
      for (const k in src) if (I$contains(rel, k)) c[k] = src[k];
    }
    if (hasTime) {
      const ts = I$STYLE_TIME[o.timeStyle];
      for (const k in ts) if (k !== 'timeZoneName') c[k] = ts[k];
      if (o.hc === 'h23' || o.hc === 'h24') c.hour = '2-digit';
    }
    return c;
  }
  let anyPresent = false, needDefaults = true;
  for (let i = 0; i < I$DTF_COMPONENTS.length; i++) {
    const name = I$DTF_COMPONENTS[i][0], v = o.explicit[name];
    if (v === undefined) continue;
    if (name !== 'era' && name !== 'timeZoneName') anyPresent = true;
    if (I$contains(rel, name)) {
      c[name] = v;
      if (name !== 'era') needDefaults = false;
    }
  }
  if (needDefaults) {
    if (anyPresent) throw new TypeError('Invalid format options for ' + kind);
    const d = I$temporalDefaults(kind);
    for (let i = 0; i < d.length; i++) c[d[i]] = 'numeric';
  }
  I$bestFitComponents(c, o.hc);
  return c;
};
const I$temporalIsoMs = (kind, x) => {
  let s = String(x.toString()), i = 0, y = 1972, mo = 1, d = 1, h = 0, mi = 0, sec = 0, ms = 0;
  const num = n => {
    const v = +s.slice(i, i + n);
    i += n;
    return v;
  };
  if (kind !== 'PlainTime') {
    if (kind === 'PlainMonthDay' && s[0] === '-' && s[1] === '-') {
      i = 2;
      mo = num(2);
      i++;
      d = num(2);
    } else if (kind === 'PlainMonthDay' && s[2] === '-') {
      mo = num(2);
      i++;
      d = num(2);
    } else {
      let sign = 1;
      if (s[0] === '+' || s[0] === '-') {
        sign = s[0] === '-' ? -1 : 1;
        i = 1;
        y = sign * num(6);
      } else y = num(4);
      i++;
      mo = num(2);
      if (s[i] === '-') {
        i++;
        d = num(2);
      }
    }
    if (s[i] === 'T') i++;
  }
  if (kind === 'PlainTime' || kind === 'PlainDateTime') {
    h = num(2);
    i++;
    mi = num(2);
    if (s[i] === ':') {
      i++;
      sec = num(2);
    }
    if (s[i] === '.') {
      i++;
      ms = +(s.slice(i, i + 3) + '00').slice(0, 3);
    }
  }
  return I$daysFromCivil(y, mo, d) * 86400000 + ((h * 60 + mi) * 60 + sec) * 1000 + ms;
};
const I$instantValue = (o, x) => {
  const c = o.dateStyle !== undefined || o.timeStyle !== undefined ? I$dtfComponents(o) : I$temporalComponents(o, 'Instant');
  if (o.dateStyle === undefined && o.timeStyle === undefined && o.explicit.timeZoneName !== undefined) c.timeZoneName = o.explicit.timeZoneName;
  return { kind: 'Instant', t: x.epochMilliseconds, c, offset: o.tzOffset, zone: true };
};
const I$toDTValue = (o, x) => {
  const kind = I$temporalKind(x);
  if (kind === '') return I$dateValue(o, I$toDateValue(x));
  if (kind === 'ZonedDateTime') throw new TypeError('Temporal.ZonedDateTime is not supported by Intl.DateTimeFormat');
  if (kind === 'Instant') return I$instantValue(o, x);
  if (kind === 'Duration') throw new TypeError('Temporal.Duration cannot be formatted by Intl.DateTimeFormat');
  if (kind !== 'PlainTime') {
    const cal = x.calendarId;
    if (cal !== o.calendar && (cal !== 'iso8601' || kind === 'PlainYearMonth' || kind === 'PlainMonthDay')) throw new RangeError('Calendar ' + cal + ' does not match the formatter calendar ' + o.calendar);
  }
  return { kind, t: I$temporalIsoMs(kind, x), c: I$temporalComponents(o, kind), offset: 0, zone: false };
};
const I$rangeValues = (o, start, end) => {
  if (start === undefined || end === undefined) throw new TypeError('startDate and endDate are required');
  const kx = I$temporalKind(start), ky = I$temporalKind(end);
  if (kx === '') start = I$toNum(start);
  if (ky === '') end = I$toNum(end);
  if (kx !== ky) throw new TypeError('Cannot format a range of different kinds of values');
  return [ I$toDTValue(o, start), I$toDTValue(o, end) ];
};
const I$dtRangeParts = (o, x, y) => {
  const a = I$dtParts(o, x), b = I$dtParts(o, y), out = [];
  let same = a.length === b.length;
  if (same) {
    for (let i = 0; i < a.length; i++) {
      if (a[i].value !== b[i].value) {
        same = false;
        break;
      }
    }
  }
  if (same) {
    for (let i = 0; i < a.length; i++) {
      a[i].source = 'shared';
      I$push(out, a[i]);
    }
    return out;
  }
  let lo = 0, hi = -1;
  let full = a.length !== b.length;
  if (!full) {
    let firstDiff = -1, lastDiff = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i].value !== b[i].value) {
        if (firstDiff === -1) firstDiff = i;
        lastDiff = i;
      }
    }
    const c = x.c;
    const textMonth = c.month === 'long' || c.month === 'short' || c.month === 'narrow';
    for (let i = 0; i < a.length; i++) if ((a[i].type === 'year' || a[i].type === 'era' || a[i].type === 'relatedYear' || a[i].type === 'yearName') && a[i].value !== b[i].value) full = true;
    if (a[firstDiff].group === 'date' && !textMonth) full = true;
    if (a[firstDiff].group === 'date' && lastDiff >= 0 && a[lastDiff].group !== 'date') full = true;
    if (!full) {
      lo = firstDiff;
      hi = lastDiff;
      if (a[lo].group === 'time') {
        while (lo > 0 && a[lo - 1].group === 'time') lo--;
      } else {
        for (let i = 0; i < a.length; i++) if (a[i].type === 'weekday') lo = i < lo ? i : lo;
        if (a[lo].type === 'day') {
          for (let i = 0; i < a.length; i++) if (a[i].type === 'month' && a[i].value !== b[i].value) lo = i < lo ? i : lo;
        }
      }
    }
  }
  if (full) {
    lo = 0;
    hi = a.length - 1;
  }
  for (let i = 0; i < lo; i++) {
    a[i].source = 'shared';
    I$push(out, a[i]);
  }
  for (let i = lo; i <= hi; i++) {
    a[i].source = 'startRange';
    I$push(out, a[i]);
  }
  const sep = I$part('literal', ' \u2013 ');
  sep.source = 'shared';
  I$push(out, sep);
  for (let i = lo; i <= hi; i++) {
    b[i].source = 'endRange';
    I$push(out, b[i]);
  }
  for (let i = hi + 1; i < a.length; i++) {
    a[i].source = 'shared';
    I$push(out, a[i]);
  }
  return out;
};
I$defineService(I$DateTimeFormat, 0, 'DateTimeFormat', {
  get format() {
    const o = I$unwrapLegacy(this, I$DateTimeFormat, 'an Intl.DateTimeFormat');
    if (o.boundFormat === undefined) o.boundFormat = date => I$partsToString(I$dtParts(o, I$toDTValue(o, date)));
    return o.boundFormat;
  },
  formatToParts(date) {
    const o = I$unwrapLegacy(this, I$DateTimeFormat, 'an Intl.DateTimeFormat');
    return I$partsToArray(I$dtParts(o, I$toDTValue(o, date)));
  },
  formatRange(startDate, endDate) {
    const o = I$unwrapLegacy(this, I$DateTimeFormat, 'an Intl.DateTimeFormat');
    const v = I$rangeValues(o, startDate, endDate);
    return I$partsToString(I$dtRangeParts(o, v[0], v[1]));
  },
  formatRangeToParts(startDate, endDate) {
    const o = I$unwrapLegacy(this, I$DateTimeFormat, 'an Intl.DateTimeFormat');
    const v = I$rangeValues(o, startDate, endDate);
    return I$partsToArray(I$dtRangeParts(o, v[0], v[1]), 'source');
  },
  resolvedOptions() {
    const o = I$unwrapLegacy(this, I$DateTimeFormat, 'an Intl.DateTimeFormat'), hc = o.hourCycle;
    return I$dropUndefined({
      locale: o.locale, calendar: o.calendar, numberingSystem: o.numberingSystem, timeZone: o.timeZone, hourCycle: hc,
      hour12: hc === undefined ? undefined : hc === 'h11' || hc === 'h12',
      weekday: o.weekday, era: o.era, year: o.year, month: o.month, day: o.day, dayPeriod: o.dayPeriod, hour: o.hour, minute: o.minute,
      second: o.second, fractionalSecondDigits: o.fractionalSecondDigits, timeZoneName: o.timeZoneName, dateStyle: o.dateStyle, timeStyle: o.timeStyle
    });
  }
});

const I$rtfData = I$lazy(() => I$table('en-lsecond=one:in # second~other:in # seconds|one:# second ago~other:# seconds ago||now|;en-lminute=one:in # minute~other:in # minutes|one:# minute ago~other:# minutes ago||this minute|;en-lhour=one:in # hour~other:in # hours|one:# hour ago~other:# hours ago||this hour|;en-lday=one:in # day~other:in # days|one:# day ago~other:# days ago|yesterday|today|tomorrow;en-lweek=one:in # week~other:in # weeks|one:# week ago~other:# weeks ago|last week|this week|next week;en-lmonth=one:in # month~other:in # months|one:# month ago~other:# months ago|last month|this month|next month;en-lquarter=one:in # quarter~other:in # quarters|one:# quarter ago~other:# quarters ago|last quarter|this quarter|next quarter;en-lyear=one:in # year~other:in # years|one:# year ago~other:# years ago|last year|this year|next year;en-ssecond=one:in # sec.~other:in # sec.|one:# sec. ago~other:# sec. ago||now|;en-sminute=one:in # min.~other:in # min.|one:# min. ago~other:# min. ago||this minute|;en-shour=one:in # hr.~other:in # hr.|one:# hr. ago~other:# hr. ago||this hour|;en-sday=one:in # day~other:in # days|one:# day ago~other:# days ago|yesterday|today|tomorrow;en-sweek=one:in # wk.~other:in # wk.|one:# wk. ago~other:# wk. ago|last wk.|this wk.|next wk.;en-smonth=one:in # mo.~other:in # mo.|one:# mo. ago~other:# mo. ago|last mo.|this mo.|next mo.;en-squarter=one:in # qtr.~other:in # qtrs.|one:# qtr. ago~other:# qtrs. ago|last qtr.|this qtr.|next qtr.;en-syear=one:in # yr.~other:in # yr.|one:# yr. ago~other:# yr. ago|last yr.|this yr.|next yr.;en-nsecond=one:in #s~other:in #s|one:#s ago~other:#s ago||now|;en-nminute=one:in #m~other:in #m|one:#m ago~other:#m ago||this minute|;en-nhour=one:in #h~other:in #h|one:#h ago~other:#h ago||this hour|;en-nday=one:in #d~other:in #d|one:#d ago~other:#d ago|yesterday|today|tomorrow;en-nweek=one:in #w~other:in #w|one:#w ago~other:#w ago|last wk.|this wk.|next wk.;en-nmonth=one:in #mo~other:in #mo|one:#mo ago~other:#mo ago|last mo.|this mo.|next mo.;en-nquarter=one:in #q~other:in #q|one:#q ago~other:#q ago|last qtr.|this qtr.|next qtr.;en-nyear=one:in #y~other:in #y|one:#y ago~other:#y ago|last yr.|this yr.|next yr.;pl-lsecond=few:za # sekundy~many:za # sekund~one:za # sekund\u0119~other:za # sekundy|few:# sekundy temu~many:# sekund temu~one:# sekund\u0119 temu~other:# sekundy temu||teraz|;pl-lminute=few:za # minuty~many:za # minut~one:za # minut\u0119~other:za # minuty|few:# minuty temu~many:# minut temu~one:# minut\u0119 temu~other:# minuty temu||ta minuta|;pl-lhour=few:za # godziny~many:za # godzin~one:za # godzin\u0119~other:za # godziny|few:# godziny temu~many:# godzin temu~one:# godzin\u0119 temu~other:# godziny temu||ta godzina|;pl-lday=few:za # dni~many:za # dni~one:za # dzie\u0144~other:za # dnia|few:# dni temu~many:# dni temu~one:# dzie\u0144 temu~other:# dnia temu|wczoraj|dzisiaj|jutro;pl-lweek=few:za # tygodnie~many:za # tygodni~one:za # tydzie\u0144~other:za # tygodnia|few:# tygodnie temu~many:# tygodni temu~one:# tydzie\u0144 temu~other:# tygodnia temu|w zesz\u0142ym tygodniu|w tym tygodniu|w przysz\u0142ym tygodniu;pl-lmonth=few:za # miesi\u0105ce~many:za # miesi\u0119cy~one:za # miesi\u0105c~other:za # miesi\u0105ca|few:# miesi\u0105ce temu~many:# miesi\u0119cy temu~one:# miesi\u0105c temu~other:# miesi\u0105ca temu|w zesz\u0142ym miesi\u0105cu|w tym miesi\u0105cu|w przysz\u0142ym miesi\u0105cu;pl-lquarter=few:za # kwarta\u0142y~many:za # kwarta\u0142\u00f3w~one:za # kwarta\u0142~other:za # kwarta\u0142u|few:# kwarta\u0142y temu~many:# kwarta\u0142\u00f3w temu~one:# kwarta\u0142 temu~other:# kwarta\u0142u temu|w zesz\u0142ym kwartale|w tym kwartale|w przysz\u0142ym kwartale;pl-lyear=few:za # lata~many:za # lat~one:za # rok~other:za # roku|few:# lata temu~many:# lat temu~one:# rok temu~other:# roku temu|w zesz\u0142ym roku|w tym roku|w przysz\u0142ym roku;pl-ssecond=few:za # sek.~many:za # sek.~one:za # sek.~other:za # sek.|few:# sek. temu~many:# sek. temu~one:# sek. temu~other:# sek. temu||teraz|;pl-sminute=few:za # min~many:za # min~one:za # min~other:za # min|few:# min temu~many:# min temu~one:# min temu~other:# min temu||ta minuta|;pl-shour=few:za # godz.~many:za # godz.~one:za # godz.~other:za # godz.|few:# godz. temu~many:# godz. temu~one:# godz. temu~other:# godz. temu||ta godzina|;pl-sday=few:za # dni~many:za # dni~one:za # dzie\u0144~other:za # dnia|few:# dni temu~many:# dni temu~one:# dzie\u0144 temu~other:# dnia temu|wczoraj|dzisiaj|jutro;pl-sweek=few:za # tyg.~many:za # tyg.~one:za # tydz.~other:za # tyg.|few:# tyg. temu~many:# tyg. temu~one:# tydz. temu~other:# tyg. temu|w zesz\u0142ym tyg.|w tym tyg.|w przysz\u0142ym tyg.;pl-smonth=few:za # mies.~many:za # mies.~one:za # mies.~other:za # mies.|few:# mies. temu~many:# mies. temu~one:# mies. temu~other:# mies. temu|w zesz\u0142ym mies.|w tym mies.|w przysz\u0142ym mies.;pl-squarter=few:za # kw.~many:za # kw.~one:za # kw.~other:za # kw.|few:# kw. temu~many:# kw. temu~one:# kw. temu~other:# kw. temu|w zesz\u0142ym kwartale|w tym kwartale|w przysz\u0142ym kwartale;pl-syear=few:za # lata~many:za # lat~one:za # rok~other:za # roku|few:# lata temu~many:# lat temu~one:# rok temu~other:# roku temu|w zesz\u0142ym roku|w tym roku|w przysz\u0142ym roku;pl-nsecond=few:za # s~many:za # s~one:za # s~other:za # s|few:# s temu~many:# s temu~one:# s temu~other:# s temu||teraz|;pl-nminute=few:za # min~many:za # min~one:za # min~other:za # min|few:# min temu~many:# min temu~one:# min temu~other:# min temu||ta minuta|;pl-nhour=few:za # g.~many:za # g.~one:za # g.~other:za # g.|few:# g. temu~many:# g. temu~one:# g. temu~other:# g. temu||ta godzina|;pl-nday=few:za # dni~many:za # dni~one:za # dzie\u0144~other:za # dnia|few:# dni temu~many:# dni temu~one:# dzie\u0144 temu~other:# dnia temu|wcz.|dzi\u015b|jutro;pl-nweek=few:za # tyg.~many:za # tyg.~one:za # tydz.~other:za # tyg.|few:# tyg. temu~many:# tyg. temu~one:# tydz. temu~other:# tyg. temu|w zesz\u0142ym tyg.|w tym tyg.|w przysz\u0142ym tyg.;pl-nmonth=few:za # mies.~many:za # mies.~one:za # mies.~other:za # mies.|few:# mies. temu~many:# mies. temu~one:# mies. temu~other:# mies. temu|w zesz\u0142ym mies.|w tym mies.|w przysz\u0142ym mies.;pl-nquarter=few:za # kw.~many:za # kw.~one:za # kw.~other:za # kw.|few:# kw. temu~many:# kw. temu~one:# kw. temu~other:# kw. temu|w zesz\u0142ym kwartale|w tym kwartale|w przysz\u0142ym kwartale;pl-nyear=few:za # lata~many:za # lat~one:za # rok~other:za # roku|few:# lata temu~many:# lat temu~one:# rok temu~other:# roku temu|w zesz\u0142ym roku|w tym roku|w przysz\u0142ym roku', ';', '='));
const I$RTF_UNITS = [ 'second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year' ];
const I$RelativeTimeFormat = function RelativeTimeFormat(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.RelativeTimeFormat requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$coerceOptionsToObject(options);
  const opt = { localeMatcher: I$getLocaleMatcher(options), nu: I$getUTypeOption(options, 'numberingSystem') };
  const r = I$resolveLocale(requested, opt, [ 'nu' ], I$nfLocaleData);
  const o = { locale: r.locale, dataLocale: r.dataLocale, numberingSystem: r.nu, style: '', numeric: '', nf: null };
  o.style = I$getOption(options, 'style', 'string', [ 'long', 'short', 'narrow' ], 'long');
  o.numeric = I$getOption(options, 'numeric', 'string', [ 'always', 'auto' ], 'always');
  const nf = I$newDigitSlots();
  nf.locale = r.locale;
  nf.dataLocale = r.dataLocale;
  nf.numberingSystem = r.nu;
  nf.minimumFractionDigits = 0;
  nf.maximumFractionDigits = 3;
  nf.roundingType = 'fractionDigits';
  o.nf = nf;
  I$setSlots(this, 'an Intl.RelativeTimeFormat', o);
};
const I$relativeTimeParts = (o, value, unit) => {
  value = I$toNum(value);
  unit = I$toStr(unit);
  if (value !== value || value === Infinity || value === -Infinity) throw new RangeError('Invalid value');
  let u = unit;
  if (u[u.length - 1] === 's') u = u.slice(0, -1);
  if (!I$contains(I$RTF_UNITS, u)) throw new RangeError('Invalid unit argument for format() \'' + unit + '\'');
  let lang = I$tagInfo(o.dataLocale).lang, d = I$rtfData();
  if (d[lang + '-' + o.style[0] + u] === undefined) lang = 'en';
  const row = I$splitStr(d[lang + '-' + o.style[0] + u], '|');
  const past = value < 0 || (value === 0 && 1 / value < 0);
  if (o.numeric === 'auto') {
    const ex = value === -1 ? row[2] : (value === 0 ? row[3] : (value === 1 ? row[4] : ''));
    if (ex) return [ I$part('literal', ex) ];
  }
  const x = I$decFromNumber(past ? -value : value);
  const res = I$formatNumericToString(o.nf, x);
  let cat = I$pluralCategory('cardinal', res.str, lang), pats = I$splitStr(row[past ? 1 : 0], '~'), pat = '';
  for (let k = 0; k < pats.length; k++) {
    const c = pats[k].indexOf(':');
    if (pats[k].slice(0, c) === cat || (pat === '' && pats[k].slice(0, c) === 'other')) pat = pats[k].slice(c + 1);
  }
  const num = [];
  I$numberParts(o.nf, res.rounded, res.str, 0, num);
  const out = [], hash = pat.indexOf('#');
  if (hash > 0) I$push(out, I$part('literal', pat.slice(0, hash)));
  for (let i = 0; i < num.length; i++) {
    num[i].unit = u;
    I$push(out, num[i]);
  }
  if (hash + 1 < pat.length) I$push(out, I$part('literal', pat.slice(hash + 1)));
  return out;
};
I$defineService(I$RelativeTimeFormat, 0, 'RelativeTimeFormat', {
  format(value, unit) { return I$partsToString(I$relativeTimeParts(I$thisSlots(this, 'an Intl.RelativeTimeFormat'), value, unit)); },
  formatToParts(value, unit) { return I$partsToArray(I$relativeTimeParts(I$thisSlots(this, 'an Intl.RelativeTimeFormat'), value, unit), 'unit'); },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.RelativeTimeFormat');
    return { locale: o.locale, style: o.style, numeric: o.numeric, numberingSystem: o.numberingSystem };
  }
});

const I$ListFormat = function ListFormat(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.ListFormat requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$getOptionsObject(options);
  const r = I$resolveLocale(requested, { localeMatcher: I$getLocaleMatcher(options) }, [], I$nfLocaleData);
  const o = { locale: r.locale, dataLocale: r.dataLocale, type: '', style: '' };
  o.type = I$getOption(options, 'type', 'string', [ 'conjunction', 'disjunction', 'unit' ], 'conjunction');
  o.style = I$getOption(options, 'style', 'string', [ 'long', 'short', 'narrow' ], 'long');
  I$setSlots(this, 'an Intl.ListFormat', o);
};
const I$stringListFromIterable = iterable => {
  const list = [];
  if (iterable === undefined) return list;
  const method = iterable[Symbol.iterator];
  if (typeof method !== 'function') throw new TypeError('Value is not iterable');
  const iter = method.call(iterable);
  const next = iter.next;
  while (true) {
    const r = next.call(iter);
    if (!I$isObj(r)) throw new TypeError('Iterator result is not an object');
    if (r.done) return list;
    const v = r.value;
    if (typeof v !== 'string') {
      const ret = iter['return'];
      if (ret !== undefined && ret !== null) ret.call(iter);
      throw new TypeError('Iterable yielded ' + (typeof v === 'symbol' ? 'a symbol' : String(v)) + ' which is not a string');
    }
    I$push(list, v);
  }
};
const I$listData = I$lazy(() => I$table('en-conjunction= and |, |, and / & |, |, & /, |, |, ;en-disjunction= or |, |, or / or |, |, or / or |, |, or ;en-unit=, |, |, /, |, |, / | | ;es-conjunction= y |, | y / y |, | y / y |, | y ;es-disjunction= o |, | o / o |, | o / o |, | o ;es-unit= y |, | y / y |, |, / | | ;de-conjunction= und |, | und / und |, | und / und |, | und ;de-disjunction= oder |, | oder / oder |, | oder / oder |, | oder ;de-unit=, |, | und /, |, | und /, |, | und ;fr-conjunction= et |, | et / et |, | et /, |, |, ;fr-disjunction= ou |, | ou / ou |, | ou / ou |, | ou ;fr-unit= et |, | et / et |, | et / | | ;it-conjunction= e |, | e / e |, | e / e |, | e ;it-disjunction= o |, | o / o |, | o / o |, | o ;it-unit= e |, | e / e |, | e / | | ;pt-conjunction= e |, | e / e |, | e /, |, |, ;pt-disjunction= ou |, | ou / ou |, | ou / ou |, | ou ;pt-unit= e |, | e / e |, | e / | | ;nl-conjunction= en |, | en / & |, | & /, |, |, ;nl-disjunction= of |, | of / of |, | of / of |, | of ;nl-unit= en |, | en /, |, |, /, |, |, ;ja-conjunction=\u3001|\u3001|\u3001/\u3001|\u3001|\u3001/\u3001|\u3001|\u3001;ja-disjunction=\u307e\u305f\u306f|\u3001|\u3001\u307e\u305f\u306f/\u307e\u305f\u306f|\u3001|\u3001\u307e\u305f\u306f/\u307e\u305f\u306f|\u3001|\u3001\u307e\u305f\u306f;ja-unit= | | / | | /||;zh-conjunction=\u548c|\u3001|\u548c/\u548c|\u3001|\u548c/\u3001|\u3001|\u3001;zh-disjunction=\u6216|\u3001|\u6216/\u6216|\u3001|\u6216/\u6216|\u3001|\u6216;zh-unit=||/||/||;ko-conjunction= \ubc0f |, | \ubc0f / \ubc0f |, | \ubc0f / \ubc0f |, | \ubc0f ;ko-disjunction= \ub610\ub294 |, | \ub610\ub294 / \ub610\ub294 |, | \ub610\ub294 / \ub610\ub294 |, | \ub610\ub294 ;ko-unit= | | / | | / | | ;ru-conjunction= \u0438 |, | \u0438 / \u0438 |, | \u0438 /, |, |, ;ru-disjunction= \u0438\u043b\u0438 |, | \u0438\u043b\u0438 / \u0438\u043b\u0438 |, | \u0438\u043b\u0438 / \u0438\u043b\u0438 |, | \u0438\u043b\u0438 ;ru-unit= | | / | | / | | ;pl-conjunction= i |, | i / i |, | i / i |, | i ;pl-disjunction= lub |, | lub / lub |, | lub / lub |, | lub ;pl-unit= i |, | i / i |, | i / i |, | i ;sv-conjunction= och |, | och / och |, | och /, |, |, ;sv-disjunction= eller |, | eller / eller |, | eller / eller |, | eller ;sv-unit=, |, |, /, |, |, / | |', ';', '='));
const I$listParts = (o, list) => {
  const out = [], n = list.length;
  if (n === 0) return out;
  let lang = I$tagInfo(o.dataLocale).lang, d = I$listData();
  if (d[lang + '-' + o.type] === undefined) lang = 'en';
  const seps = I$splitStr(I$splitStr(d[lang + '-' + o.type], '/')[o.style === 'long' ? 0 : o.style === 'short' ? 1 : 2], '|');
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      let sep = n === 2 ? seps[0] : (i === n - 1 ? seps[2] : seps[1]);
      // es: y -> e before an /i/ sound, o -> u before an /o/ sound
      if (lang === 'es') {
        const next = I$asciiLower(list[i].slice(0, 3)) || '';
        if (sep.slice(-3) === ' y ' && (next[0] === 'i' || (next[0] === 'h' && next[1] === 'i' && 'aeou'.indexOf(next[2] || 'x') === -1))) sep = sep.slice(0, -3) + ' e ';
        if (sep.slice(-3) === ' o ' && (next[0] === 'o' || next[0] === '8' || (next[0] === 'h' && next[1] === 'o') || list[i] === '11' || list[i].slice(0, 3) === '11 ')) sep = sep.slice(0, -3) + ' u ';
      }
      I$push(out, I$part('literal', sep));
    }
    I$push(out, I$part('element', list[i]));
  }
  return out;
};
I$defineService(I$ListFormat, 0, 'ListFormat', {
  format(list) {
    const o = I$thisSlots(this, 'an Intl.ListFormat');
    return I$partsToString(I$listParts(o, I$stringListFromIterable(list)));
  },
  formatToParts(list) {
    const o = I$thisSlots(this, 'an Intl.ListFormat');
    return I$partsToArray(I$listParts(o, I$stringListFromIterable(list)));
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.ListFormat');
    return { locale: o.locale, type: o.type, style: o.style };
  }
});

const I$dnData = I$lazy(() => ({
  language: I$table('af:Afrikaans;am:Amharic;ar:Arabic;as:Assamese;az:Azerbaijani;be:Belarusian;bg:Bulgarian;bn:Bangla;bs:Bosnian;ca:Catalan;cs:Czech;cy:Welsh;da:Danish;de:German;el:Greek;en:English;es:Spanish;et:Estonian;eu:Basque;fa:Persian;fi:Finnish;fil:Filipino;fr:French;ga:Irish;gl:Galician;gu:Gujarati;ha:Hausa;he:Hebrew;hi:Hindi;hr:Croatian;hu:Hungarian;hy:Armenian;id:Indonesian;ig:Igbo;is:Icelandic;it:Italian;ja:Japanese;ka:Georgian;kk:Kazakh;km:Khmer;kn:Kannada;ko:Korean;ky:Kyrgyz;lo:Lao;lt:Lithuanian;lv:Latvian;mk:Macedonian;ml:Malayalam;mn:Mongolian;mr:Marathi;ms:Malay;my:Burmese;nb:Norwegian Bokm\u00e5l;ne:Nepali;nl:Dutch;nn:Norwegian Nynorsk;no:Norwegian;or:Odia;pa:Punjabi;pl:Polish;ps:Pashto;pt:Portuguese;ro:Romanian;ru:Russian;sd:Sindhi;si:Sinhala;sk:Slovak;sl:Slovenian;so:Somali;sq:Albanian;sr:Serbian;sv:Swedish;sw:Swahili;ta:Tamil;te:Telugu;th:Thai;tk:Turkmen;tr:Turkish;uk:Ukrainian;ur:Urdu;uz:Uzbek;vi:Vietnamese;yo:Yoruba;yue:Cantonese;zh:Chinese;zu:Zulu', ';'), region: I$table('AC:Ascension Island;AD:Andorra;AE:United Arab Emirates;AF:Afghanistan;AG:Antigua & Barbuda;AI:Anguilla;AL:Albania;AM:Armenia;AN:Cura\u00e7ao;AO:Angola;AQ:Antarctica;AR:Argentina;AS:American Samoa;AT:Austria;AU:Australia;AW:Aruba;AX:\u00c5land Islands;AZ:Azerbaijan;BA:Bosnia & Herzegovina;BB:Barbados;BD:Bangladesh;BE:Belgium;BF:Burkina Faso;BG:Bulgaria;BH:Bahrain;BI:Burundi;BJ:Benin;BL:St. Barth\u00e9lemy;BM:Bermuda;BN:Brunei;BO:Bolivia;BQ:Caribbean Netherlands;BR:Brazil;BS:Bahamas;BT:Bhutan;BU:Myanmar (Burma);BV:Bouvet Island;BW:Botswana;BY:Belarus;BZ:Belize;CA:Canada;CC:Cocos (Keeling) Islands;CD:Congo - Kinshasa;CF:Central African Republic;CG:Congo - Brazzaville;CH:Switzerland;CI:C\u00f4te d\u2019Ivoire;CK:Cook Islands;CL:Chile;CM:Cameroon;CN:China;CO:Colombia;CP:Clipperton Island;CQ:Sark;CR:Costa Rica;CS:Serbia;CU:Cuba;CV:Cape Verde;CW:Cura\u00e7ao;CX:Christmas Island;CY:Cyprus;CZ:Czechia;DD:Germany;DE:Germany;DG:Diego Garcia;DJ:Djibouti;DK:Denmark;DM:Dominica;DO:Dominican Republic;DY:Benin;DZ:Algeria;EA:Ceuta & Melilla;EC:Ecuador;EE:Estonia;EG:Egypt;EH:Western Sahara;ER:Eritrea;ES:Spain;ET:Ethiopia;EU:European Union;EZ:Eurozone;FI:Finland;FJ:Fiji;FK:Falkland Islands;FM:Micronesia;FO:Faroe Islands;FR:France;FX:France;GA:Gabon;GB:United Kingdom;GD:Grenada;GE:Georgia;GF:French Guiana;GG:Guernsey;GH:Ghana;GI:Gibraltar;GL:Greenland;GM:Gambia;GN:Guinea;GP:Guadeloupe;GQ:Equatorial Guinea;GR:Greece;GS:South Georgia & South Sandwich Islands;GT:Guatemala;GU:Guam;GW:Guinea-Bissau;GY:Guyana;HK:Hong Kong SAR China;HM:Heard & McDonald Islands;HN:Honduras;HR:Croatia;HT:Haiti;HU:Hungary;HV:Burkina Faso;IC:Canary Islands;ID:Indonesia;IE:Ireland;IL:Israel;IM:Isle of Man;IN:India;IO:British Indian Ocean Territory;IQ:Iraq;IR:Iran;IS:Iceland;IT:Italy;JE:Jersey;JM:Jamaica;JO:Jordan;JP:Japan;KE:Kenya;KG:Kyrgyzstan;KH:Cambodia;KI:Kiribati;KM:Comoros;KN:St. Kitts & Nevis;KP:North Korea;KR:South Korea;KW:Kuwait;KY:Cayman Islands;KZ:Kazakhstan;LA:Laos;LB:Lebanon;LC:St. Lucia;LI:Liechtenstein;LK:Sri Lanka;LR:Liberia;LS:Lesotho;LT:Lithuania;LU:Luxembourg;LV:Latvia;LY:Libya;MA:Morocco;MC:Monaco;MD:Moldova;ME:Montenegro;MF:St. Martin;MG:Madagascar;MH:Marshall Islands;MK:North Macedonia;ML:Mali;MM:Myanmar (Burma);MN:Mongolia;MO:Macao SAR China;MP:Northern Mariana Islands;MQ:Martinique;MR:Mauritania;MS:Montserrat;MT:Malta;MU:Mauritius;MV:Maldives;MW:Malawi;MX:Mexico;MY:Malaysia;MZ:Mozambique;NA:Namibia;NC:New Caledonia;NE:Niger;NF:Norfolk Island;NG:Nigeria;NH:Vanuatu;NI:Nicaragua;NL:Netherlands;NO:Norway;NP:Nepal;NR:Nauru;NU:Niue;NZ:New Zealand;OM:Oman;PA:Panama;PE:Peru;PF:French Polynesia;PG:Papua New Guinea;PH:Philippines;PK:Pakistan;PL:Poland;PM:St. Pierre & Miquelon;PN:Pitcairn Islands;PR:Puerto Rico;PS:Palestinian Territories;PT:Portugal;PW:Palau;PY:Paraguay;QA:Qatar;QO:Outlying Oceania;RE:R\u00e9union;RH:Zimbabwe;RO:Romania;RS:Serbia;RU:Russia;RW:Rwanda;SA:Saudi Arabia;SB:Solomon Islands;SC:Seychelles;SD:Sudan;SE:Sweden;SG:Singapore;SH:St. Helena;SI:Slovenia;SJ:Svalbard & Jan Mayen;SK:Slovakia;SL:Sierra Leone;SM:San Marino;SN:Senegal;SO:Somalia;SR:Suriname;SS:South Sudan;ST:S\u00e3o Tom\u00e9 & Pr\u00edncipe;SU:Russia;SV:El Salvador;SX:Sint Maarten;SY:Syria;SZ:Eswatini;TA:Tristan da Cunha;TC:Turks & Caicos Islands;TD:Chad;TF:French Southern Territories;TG:Togo;TH:Thailand;TJ:Tajikistan;TK:Tokelau;TL:Timor-Leste;TM:Turkmenistan;TN:Tunisia;TO:Tonga;TP:Timor-Leste;TR:T\u00fcrkiye;TT:Trinidad & Tobago;TV:Tuvalu;TW:Taiwan;TZ:Tanzania;UA:Ukraine;UG:Uganda;UK:United Kingdom;UM:U.S. Outlying Islands;UN:United Nations;US:United States;UY:Uruguay;UZ:Uzbekistan;VA:Vatican City;VC:St. Vincent & Grenadines;VD:Vietnam;VE:Venezuela;VG:British Virgin Islands;VI:U.S. Virgin Islands;VN:Vietnam;VU:Vanuatu;WF:Wallis & Futuna;WS:Samoa;XA:Pseudo-Accents;XB:Pseudo-Bidi;XK:Kosovo;YD:Yemen;YE:Yemen;YT:Mayotte;YU:Serbia;ZA:South Africa;ZM:Zambia;ZR:Congo - Kinshasa;ZW:Zimbabwe;ZZ:Unknown Region;001:world;002:Africa;019:Americas;142:Asia;150:Europe;419:Latin America', ';'), script: I$table('Arab:Arabic;Armn:Armenian;Beng:Bangla;Cyrl:Cyrillic;Deva:Devanagari;Ethi:Ethiopic;Geor:Georgian;Grek:Greek;Gujr:Gujarati;Guru:Gurmukhi;Hang:Hangul;Hani:Han;Hans:Simplified;Hant:Traditional;Hebr:Hebrew;Hira:Hiragana;Jpan:Japanese;Kana:Katakana;Khmr:Khmer;Knda:Kannada;Kore:Korean;Laoo:Lao;Latn:Latin;Mlym:Malayalam;Mong:Mongolian;Mymr:Myanmar;Orya:Odia;Sinh:Sinhala;Taml:Tamil;Telu:Telugu;Thaa:Thaana;Thai:Thai;Tibt:Tibetan', ';'),
  calendar: I$table('buddhist:Buddhist Calendar;chinese:Chinese Calendar;coptic:Coptic Calendar;dangi:Dangi Calendar;ethioaa:Ethiopic Amete Alem Calendar;ethiopic:Ethiopic Calendar;gregory:Gregorian Calendar;hebrew:Hebrew Calendar;indian:Indian National Calendar;islamic:Hijri Calendar;islamic-civil:Hijri Calendar (tabular, civil epoch);islamic-rgsa:Hijri Calendar (Saudi Arabia, sighting);islamic-tbla:Hijri Calendar (tabular, astronomical epoch);islamic-umalqura:Hijri Calendar (Umm al-Qura);iso8601:ISO-8601 Calendar;japanese:Japanese Calendar;persian:Persian Calendar;roc:Minguo Calendar', ';'), field: I$splitStr('era,year,quarter,month,week,day of the week,day,AM/PM,hour,minute,second,time zone|era,yr.,qtr.,mo.,wk.,day of wk.,day,AM/PM,hr.,min.,sec.,zone|era,yr,qtr,mo,wk,day of wk.,day,AM/PM,hr,min,sec,zone', '|')
}));
const I$DT_FIELDS = [ 'era', 'year', 'quarter', 'month', 'weekOfYear', 'weekday', 'day', 'dayPeriod', 'hour', 'minute', 'second', 'timeZoneName' ];
const I$DisplayNames = function DisplayNames(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.DisplayNames requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$getOptionsObject(options);
  const r = I$resolveLocale(requested, { localeMatcher: I$getLocaleMatcher(options) }, [], I$nfLocaleData);
  const o = { locale: r.locale, style: '', type: '', fallback: '', languageDisplay: undefined };
  o.style = I$getOption(options, 'style', 'string', [ 'narrow', 'short', 'long' ], 'long');
  const type = I$getOption(options, 'type', 'string', [ 'language', 'region', 'script', 'currency', 'calendar', 'dateTimeField' ], undefined);
  if (type === undefined) throw new TypeError('Required option \'type\' is missing');
  o.type = type;
  o.fallback = I$getOption(options, 'fallback', 'string', [ 'code', 'none' ], 'code');
  const languageDisplay = I$getOption(options, 'languageDisplay', 'string', [ 'dialect', 'standard' ], 'dialect');
  if (type === 'language') o.languageDisplay = languageDisplay;
  I$setSlots(this, 'an Intl.DisplayNames', o);
};
const I$displayName = (o, code) => {
  let d = I$dnData(), t = o.type, v;
  if (t === 'language') {
    const lc = I$asciiLower(code);
    const p = lc === null ? null : I$splitStr(lc, '-');
    const r = p === null ? null : I$parseLangId(p, 0);
    if (r === null || r.end !== p.length) throw new RangeError('invalid language code');
    code = I$canonicalizeTag(code);
    const id = I$parseTag(code);
    v = d.language[id.lang];
    if (v !== undefined) {
      const extra = [];
      if (id.script && d.script[I$titleCase(id.script)]) I$push(extra, d.script[I$titleCase(id.script)]);
      if (id.region && d.region[I$asciiUpper(id.region)]) I$push(extra, d.region[I$asciiUpper(id.region)]);
      if ((id.script && !d.script[I$titleCase(id.script)]) || (id.region && !d.region[I$asciiUpper(id.region)]) || id.variants.length) v = undefined;
      else if (extra.length) v += ' (' + I$join(extra, ', ') + ')';
    }
    return v !== undefined ? v : (o.fallback === 'code' ? code : undefined);
  }
  if (t === 'region') {
    if (!I$isRegionSub(code)) throw new RangeError('invalid region code');
    code = I$asciiUpper(code);
    v = d.region[code];
  } else if (t === 'script') {
    if (!I$isScriptSub(code)) throw new RangeError('invalid script code');
    code = I$titleCase(I$asciiLower(code));
    v = d.script[code];
  } else if (t === 'currency') {
    if (!I$isWellFormedCurrency(code)) throw new RangeError('invalid currency code');
    code = I$asciiUpper(code);
    const row = I$currencyData()[code];
    v = row === undefined ? undefined : row[3];
  } else if (t === 'calendar') {
    const low = I$asciiLower(code);
    if (low === null || !I$isUType(low)) throw new RangeError('invalid calendar code');
    code = I$canonUValue('ca', low);
    v = d.calendar[code];
  } else {
    const i = I$indexOf(I$DT_FIELDS, code);
    if (i === -1) throw new RangeError('invalid dateTimeField code');
    v = I$splitStr(d.field[o.style === 'long' ? 0 : o.style === 'short' ? 1 : 2], ',')[i];
  }
  return v !== undefined ? v : (o.fallback === 'code' ? code : undefined);
};
I$defineService(I$DisplayNames, 2, 'DisplayNames', {
  of(code) {
    const o = I$thisSlots(this, 'an Intl.DisplayNames');
    return I$displayName(o, I$toStr(code));
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.DisplayNames');
    return I$dropUndefined({ locale: o.locale, style: o.style, type: o.type, fallback: o.fallback, languageDisplay: o.languageDisplay });
  }
});

const I$Segmenter = function Segmenter(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.Segmenter requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$getOptionsObject(options);
  const r = I$resolveLocale(requested, { localeMatcher: I$getLocaleMatcher(options) }, [], I$nfLocaleData);
  const o = { locale: r.locale, granularity: '' };
  o.granularity = I$getOption(options, 'granularity', 'string', [ 'grapheme', 'word', 'sentence' ], 'grapheme');
  I$setSlots(this, 'an Intl.Segmenter', o);
};
const I$isExtendCp = c => (c >= 0x300 && c <= 0x36f) || (c >= 0x483 && c <= 0x489) || (c >= 0x591 && c <= 0x5c7 && c !== 0x5be && c !== 0x5c0 && c !== 0x5c3 && c !== 0x5c6) ||
  (c >= 0x610 && c <= 0x61a) || (c >= 0x64b && c <= 0x65f) || c === 0x670 || (c >= 0x6d6 && c <= 0x6ed && c !== 0x6dd && c !== 0x6de && c !== 0x6e5 && c !== 0x6e6 && c !== 0x6e9) ||
  (c >= 0x900 && c <= 0x903) || (c >= 0x93a && c <= 0x94f && c !== 0x93d) || (c >= 0x951 && c <= 0x957) || (c >= 0x962 && c <= 0x963) ||
  (c >= 0x981 && c <= 0x983) || (c >= 0x9bc && c <= 0x9d7 && c !== 0x9bd) || (c >= 0xa01 && c <= 0xa03) || (c >= 0xa3c && c <= 0xa51) ||
  (c >= 0xa81 && c <= 0xa83) || (c >= 0xabc && c <= 0xacd && c !== 0xabd) || (c >= 0xb01 && c <= 0xb03) || (c >= 0xb3c && c <= 0xb57 && c !== 0xb3d) ||
  c === 0xb82 || (c >= 0xbbe && c <= 0xbd7) || (c >= 0xc00 && c <= 0xc04) || (c >= 0xc3c && c <= 0xc56 && c !== 0xc3d) || (c >= 0xc81 && c <= 0xc83) ||
  (c >= 0xcbc && c <= 0xcd6 && c !== 0xcbd) || (c >= 0xd00 && c <= 0xd03) || (c >= 0xd3b && c <= 0xd57 && c !== 0xd3d && c !== 0xd4e) ||
  c === 0xe31 || (c >= 0xe34 && c <= 0xe3a) || (c >= 0xe47 && c <= 0xe4e) || c === 0xeb1 || (c >= 0xeb4 && c <= 0xebc) || (c >= 0xec8 && c <= 0xece) ||
  (c >= 0x1ab0 && c <= 0x1aff) || (c >= 0x1dc0 && c <= 0x1dff) || c === 0x200c || c === 0x200d || (c >= 0x20d0 && c <= 0x20ff) ||
  (c >= 0xfe00 && c <= 0xfe0f) || (c >= 0xfe20 && c <= 0xfe2f) || (c >= 0x1f3fb && c <= 0x1f3ff) || (c >= 0xe0020 && c <= 0xe007f) || (c >= 0xe0100 && c <= 0xe01ef);
const I$isPictographic = c => (c >= 0x1f000 && c <= 0x1faff) || (c >= 0x2600 && c <= 0x27bf) || (c >= 0x2300 && c <= 0x23ff) || (c >= 0x2b00 && c <= 0x2bff) || c === 0xa9 || c === 0xae;
const I$hangulType = c => {
  if ((c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97c)) return 'L';
  if ((c >= 0x1160 && c <= 0x11a7) || (c >= 0xd7b0 && c <= 0xd7c6)) return 'V';
  if ((c >= 0x11a8 && c <= 0x11ff) || (c >= 0xd7cb && c <= 0xd7fb)) return 'T';
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 === 0 ? 'LV' : 'LVT';
  return '';
};
const I$cpAt = (s, i) => {
  const c = s.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
    const d = s.charCodeAt(i + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return (c - 0xd800) * 0x400 + (d - 0xdc00) + 0x10000;
  }
  return c;
};
const I$graphemeBreaks = s => {
  let out = [ 0 ], i = 0, n = s.length;
  while (i < n) {
    let c = I$cpAt(s, i), j = i + (c > 0xffff ? 2 : 1);
    if (c === 13 && s.charCodeAt(j) === 10) j++;
    else if (c !== 10 && c !== 13) {
      let prev = c, ri = c >= 0x1f1e6 && c <= 0x1f1ff ? 1 : 0;
      while (j < n) {
        const d = I$cpAt(s, j), w = d > 0xffff ? 2 : 1;
        const hp = I$hangulType(prev), hd = I$hangulType(d);
        const join = I$isExtendCp(d) ||
          (prev === 0x200d && I$isPictographic(d)) ||
          (ri === 1 && d >= 0x1f1e6 && d <= 0x1f1ff) ||
          (hp === 'L' && (hd === 'L' || hd === 'V' || hd === 'LV' || hd === 'LVT')) ||
          ((hp === 'LV' || hp === 'V') && (hd === 'V' || hd === 'T')) ||
          ((hp === 'LVT' || hp === 'T') && hd === 'T');
        if (!join) break;
        if (ri === 1 && d >= 0x1f1e6 && d <= 0x1f1ff) ri = 2;
        prev = d;
        j += w;
      }
    }
    I$push(out, j);
    i = j;
  }
  return out;
};
const I$wordClass = c => {
  if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || I$isWS(c)) return 's';
  if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) return 'w';
  if (c < 0x80) return 'p';
  if (I$isSpaceOrPunct(c) || (c >= 0xff01 && c <= 0xff0f) || (c >= 0xff1a && c <= 0xff20) || (c >= 0x3001 && c <= 0x3003) || (c >= 0x3008 && c <= 0x3011) || c === 0x300a || c === 0x300b) return 'p';
  if (c >= 0xd800 && c <= 0xdfff) return 'p';
  return 'w';
};
const I$wordBreaks = s => {
  const g = I$graphemeBreaks(s), out = [ 0 ], like = [];
  let k = 0;
  while (k < g.length - 1) {
    let start = g[k], cls = I$wordClass(I$cpAt(s, start)), m = k + 1;
    if (cls === 'w' || cls === 's') {
      while (m < g.length - 1) {
        const c = I$cpAt(s, g[m]), mc = I$wordClass(c);
        if (mc === cls) {
          m++;
          continue;
        }
        // letters joined by apostrophe/period/colon, digits by comma/period
        if (cls === 'w' && (c === 39 || c === 0x2019 || c === 46 || c === 44) && m + 1 < g.length - 1 && I$wordClass(I$cpAt(s, g[m + 1])) === 'w') {
          const before = I$cpAt(s, g[m - 1]), after = I$cpAt(s, g[m + 1]);
          const digits = before >= 48 && before <= 57 && after >= 48 && after <= 57;
          if (digits || c === 39 || c === 0x2019 || (c === 46 && !(after >= 48 && after <= 57))) {
            m += 2;
            continue;
          }
        }
        break;
      }
    }
    I$push(out, g[m]);
    I$push(like, cls === 'w');
    k = m;
  }
  return [ out, like ];
};
const I$sentenceBreaks = s => {
  let out = [ 0 ], i = 0, n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    i++;
    if (c === 46 || c === 33 || c === 63 || c === 0x3002 || c === 0xff01 || c === 0xff1f || c === 10 || c === 0x2029) {
      while (i < n && (s[i] === '.' || s[i] === '!' || s[i] === '?')) i++;
      while (i < n && (s[i] === '"' || s[i] === '\'' || s[i] === ')' || s[i] === '\u201d' || s[i] === '\u2019')) i++;
      let j = i;
      while (j < n && I$isWS(s.charCodeAt(j))) j++;
      if (c === 46 && j < n && j === i) continue;
      if (c === 46 && j < n) {
        const nc = s.charCodeAt(j);
        if (nc >= 97 && nc <= 122) continue;
      }
      i = j;
      if (i < n) I$push(out, i);
    }
  }
  I$push(out, n);
  return out;
};
const I$computeSegments = (granularity, s) => {
  if (granularity === 'grapheme') return [ I$graphemeBreaks(s), null ];
  if (granularity === 'word') return I$wordBreaks(s);
  return [ s.length ? I$sentenceBreaks(s) : [ 0 ], null ];
};
const I$SegmentsPrototype = {};
const I$SegmentIteratorPrototype = I$objCreate(I$getProto(I$getProto([][Symbol.iterator]())));
const I$segmentData = (seg, k) => {
  const b = seg.breaks, text = seg.string.slice(b[k], b[k + 1]);
  if (seg.granularity === 'word') return { segment: text, index: b[k], input: seg.string, isWordLike: seg.like[k] };
  return { segment: text, index: b[k], input: seg.string };
};
const I$createSegments = (o, string) => {
  const segs = I$objCreate(I$SegmentsPrototype);
  const c = I$computeSegments(o.granularity, string);
  I$setSlots(segs, 'a Segments object', { string, granularity: o.granularity, breaks: c[0], like: c[1] });
  return segs;
};
I$install(I$SegmentsPrototype, {
  containing(index) {
    const seg = I$thisSlots(this, 'a Segments object');
    let n = I$toNum(index);
    n = n !== n ? 0 : Math.trunc(n);
    if (n < 0 || n >= seg.string.length) return undefined;
    const b = seg.breaks;
    for (let k = 0; k < b.length - 1; k++) if (n >= b[k] && n < b[k + 1]) return I$segmentData(seg, k);
    return undefined;
  },
  [Symbol.iterator]() {
    const seg = I$thisSlots(this, 'a Segments object');
    const it = I$objCreate(I$SegmentIteratorPrototype);
    I$setSlots(it, 'a Segment Iterator', { seg, k: 0 });
    return it;
  }
});
I$install(I$SegmentIteratorPrototype, {
  next() {
    const st = I$thisSlots(this, 'a Segment Iterator');
    if (st.k >= st.seg.breaks.length - 1) return { value: undefined, done: true };
    const res = { value: I$segmentData(st.seg, st.k), done: false };
    st.k++;
    return res;
  }
});
I$setTag(I$SegmentIteratorPrototype, 'Segmenter String Iterator');
I$defineService(I$Segmenter, 0, 'Segmenter', {
  segment(string) {
    const o = I$thisSlots(this, 'an Intl.Segmenter');
    return I$createSegments(o, I$toStr(string));
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.Segmenter');
    return { locale: o.locale, granularity: o.granularity };
  }
});

const I$DF_UNITS = [ 'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds' ];
const I$DurationFormat = function DurationFormat(locales, options) {
  if (new.target === undefined) throw new TypeError('Constructor Intl.DurationFormat requires \'new\'');
  const requested = I$canonicalizeLocaleList(locales);
  options = I$getOptionsObject(options);
  const opt = { localeMatcher: I$getLocaleMatcher(options), nu: I$getUTypeOption(options, 'numberingSystem') };
  const r = I$resolveLocale(requested, opt, [ 'nu' ], I$nfLocaleData);
  const o = I$objCreate(null);
  o.locale = r.locale;
  o.dataLocale = r.dataLocale;
  o.numberingSystem = r.nu;
  const style = I$getOption(options, 'style', 'string', [ 'long', 'short', 'narrow', 'digital' ], 'short');
  o.style = style;
  let prevStyle = '';
  for (let i = 0; i < I$DF_UNITS.length; i++) {
    const unit = I$DF_UNITS[i];
    const dateUnit = i < 4, subSecond = i > 6;
    const styles = dateUnit ? [ 'long', 'short', 'narrow' ] : subSecond ? [ 'long', 'short', 'narrow', 'numeric' ] : [ 'long', 'short', 'narrow', 'numeric', '2-digit' ];
    const digitalBase = dateUnit ? 'short' : 'numeric';
    let us = I$getOption(options, unit, 'string', styles, undefined);
    let displayDefault = 'always';
    if (us === undefined) {
      if (style === 'digital') {
        us = digitalBase;
        if (unit !== 'hours' && unit !== 'minutes' && unit !== 'seconds') displayDefault = 'auto';
      } else if (prevStyle === 'fractional' || prevStyle === 'numeric' || prevStyle === '2-digit') {
        us = 'numeric';
        if (unit !== 'minutes' && unit !== 'seconds') displayDefault = 'auto';
      } else {
        us = style;
        displayDefault = 'auto';
      }
    }
    if (us === 'numeric' && subSecond) {
      us = 'fractional';
      displayDefault = 'auto';
    }
    const display = I$getOption(options, unit + 'Display', 'string', [ 'auto', 'always' ], displayDefault);
    if (display === 'always' && us === 'fractional') throw new RangeError('Invalid ' + unit + 'Display with fractional style');
    if (prevStyle === 'fractional' && us !== 'fractional') throw new RangeError('Invalid style for ' + unit);
    if ((prevStyle === 'numeric' || prevStyle === '2-digit') && us !== 'fractional' && us !== 'numeric' && us !== '2-digit') throw new RangeError('Invalid style for ' + unit);
    if ((unit === 'minutes' || unit === 'seconds') && (prevStyle === 'numeric' || prevStyle === '2-digit')) us = '2-digit';
    o[unit] = us;
    o[unit + 'Display'] = display;
    if (unit === 'hours' || unit === 'minutes' || unit === 'seconds' || unit === 'milliseconds' || unit === 'microseconds') prevStyle = us;
  }
  o.fractionalDigits = I$getNumberOption(options, 'fractionalDigits', 0, 9, undefined);
  I$setSlots(this, 'an Intl.DurationFormat', o);
};
const I$toIntegerIfIntegral = v => {
  const n = I$toNum(v);
  if (n !== n || n === Infinity || n === -Infinity || Math.trunc(n) !== n) throw new RangeError('Duration values must be integers');
  return n === 0 ? 0 : n;
};
const I$parseDurationString = str => {
  let s = I$asciiUpper(str), i = 0, sign = 1;
  const bad = () => { throw new RangeError('Invalid duration string: ' + str); };
  if (s[i] === '+' || s[i] === '-' || s[i] === '\u2212') {
    sign = s[i] === '+' ? 1 : -1;
    i++;
  }
  if (s[i++] !== 'P') bad();
  const out = { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0 };
  const dateUnits = { Y: 'years', M: 'months', W: 'weeks', D: 'days' }, timeUnits = { H: 'hours', M: 'minutes', S: 'seconds' };
  let order = 'YMWDHMS', last = -1, inTime = false, any = false, fractionSeen = false;
  while (i < s.length) {
    if (s[i] === 'T') {
      if (inTime) bad();
      inTime = true;
      i++;
      if (i >= s.length) bad();
      continue;
    }
    const start = i;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    if (i === start || fractionSeen) bad();
    let intPart = s.slice(start, i), frac = '';
    if (s[i] === '.' || s[i] === ',') {
      i++;
      const fs = i;
      while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
      frac = s.slice(fs, i);
      if (frac.length === 0 || frac.length > 9) bad();
    }
    const u = s[i++], name = inTime ? timeUnits[u] : dateUnits[u];
    if (name === undefined) bad();
    const idx = inTime ? 4 + 'HMS'.indexOf(u) : 'YMWD'.indexOf(u);
    if (idx <= last) bad();
    last = idx;
    any = true;
    if (frac && !inTime) bad();
    out[name] = +intPart;
    if (frac) {
      fractionSeen = true;
      let ns = +(frac + '000000000').slice(0, 9) * (u === 'H' ? 3600 : u === 'M' ? 60 : 1);
      const secs = Math.floor(ns / 1000000000);
      ns = ns % 1000000000;
      if (u === 'H') {
        out.minutes += Math.floor(secs / 60);
        out.seconds += secs % 60;
      } else if (u === 'M') out.seconds += secs;
      out.milliseconds = Math.floor(ns / 1000000);
      out.microseconds = Math.floor(ns / 1000) % 1000;
      out.nanoseconds = ns % 1000;
    }
  }
  if (!any) bad();
  if (sign < 0) for (const k in out) if (out[k] !== 0) out[k] = -out[k];
  return out;
};
const I$toDurationRecord = input => {
  if (!I$isObj(input)) {
    if (typeof input === 'string') input = I$parseDurationString(input);
    else throw new TypeError('Duration must be an object');
  } else if (I$temporalKind(input) === 'Duration') input = I$parseDurationString(String(input.toString()));
  let d = I$objCreate(null), any = false, keys = [ 'days', 'hours', 'microseconds', 'milliseconds', 'minutes', 'months', 'nanoseconds', 'seconds', 'weeks', 'years' ];
  for (let i = 0; i < keys.length; i++) {
    const v = input[keys[i]];
    d[keys[i]] = 0;
    if (v !== undefined) {
      any = true;
      d[keys[i]] = I$toIntegerIfIntegral(v);
    }
  }
  if (!any) throw new TypeError('Duration must have at least one unit');
  let sign = 0;
  for (let i = 0; i < I$DF_UNITS.length; i++) {
    const x = d[I$DF_UNITS[i]];
    if (x === 0) continue;
    const s = x < 0 ? -1 : 1;
    if (sign !== 0 && s !== sign) throw new RangeError('Mixed-sign duration');
    sign = s;
  }
  if (Math.abs(d.years) >= 4294967296 || Math.abs(d.months) >= 4294967296 || Math.abs(d.weeks) >= 4294967296) throw new RangeError('Duration out of range');
  // all units share a sign, so the normalized time is the sum of the magnitudes
  const ns = I$addStr(I$addStr(I$addStr(I$mulStr(I$intStr(d.days), 86400000000000), I$mulStr(I$intStr(d.hours), 3600000000000)),
    I$addStr(I$mulStr(I$intStr(d.minutes), 60000000000), I$mulStr(I$intStr(d.seconds), 1000000000))),
    I$addStr(I$addStr(I$mulStr(I$intStr(d.milliseconds), 1000000), I$mulStr(I$intStr(d.microseconds), 1000)), I$intStr(d.nanoseconds)));
  if (I$cmpStr(ns, '9007199254740992000000000') >= 0) throw new RangeError('Duration out of range');
  return d;
};
const I$durationFractional = (d, exponent) => {
  let ns = I$addStr(I$intStr(d.nanoseconds), I$mulStr(I$intStr(d.microseconds), 1000));
  if (exponent >= 6) ns = I$addStr(ns, I$mulStr(I$intStr(d.milliseconds), 1000000));
  if (exponent === 9) ns = I$addStr(ns, I$mulStr(I$intStr(d.seconds), 1000000000));
  const neg = d.seconds < 0 || d.milliseconds < 0 || d.microseconds < 0 || d.nanoseconds < 0;
  return I$makeDec(neg, ns, ns.length - exponent);
};
const I$durationParts = (o, d) => {
  let result = [], needSeparator = false, displayNegativeSign = true;
  let negative = false;
  for (let i = 0; i < I$DF_UNITS.length; i++) if (d[I$DF_UNITS[i]] < 0) negative = true;
  for (let i = 0; i < I$DF_UNITS.length; i++) {
    const unit = I$DF_UNITS[i], style = o[unit], display = o[unit + 'Display'];
    let value = I$decFromNumber(d[unit]);
    const nfUnit = unit.slice(0, -1);
    let nfo = I$objCreate(null), done = false;
    if (unit === 'seconds' || unit === 'milliseconds' || unit === 'microseconds') {
      if (o[I$DF_UNITS[i + 1]] === 'fractional') {
        value = I$durationFractional(d, unit === 'seconds' ? 9 : unit === 'milliseconds' ? 6 : 3);
        nfo.maximumFractionDigits = o.fractionalDigits === undefined ? 9 : o.fractionalDigits;
        nfo.minimumFractionDigits = o.fractionalDigits === undefined ? 0 : o.fractionalDigits;
        nfo.roundingMode = 'trunc';
        done = true;
      }
    }
    let displayRequired = false;
    if (unit === 'minutes' && needSeparator) {
      displayRequired = o.secondsDisplay === 'always' || d.seconds !== 0 || d.milliseconds !== 0 || d.microseconds !== 0 || d.nanoseconds !== 0;
    }
    if (!I$decIsZero(value) || display !== 'auto' || displayRequired) {
      if (displayNegativeSign) {
        displayNegativeSign = false;
        if (I$decIsZero(value) && negative) value = I$makeDec(true, '', 0);
      } else nfo.signDisplay = 'never';
      nfo.numberingSystem = o.numberingSystem;
      if (style === '2-digit') nfo.minimumIntegerDigits = 2;
      if (style !== 'numeric' && style !== '2-digit' && style !== 'fractional') {
        nfo.style = 'unit';
        nfo.unit = nfUnit;
        nfo.unitDisplay = style;
      } else nfo.useGrouping = false;
      const nf = I$initializeNumberFormat(o.locale, nfo);
      let list;
      if (!needSeparator) list = [];
      else {
        list = result[result.length - 1];
        I$push(list, I$part('literal', ':'));
      }
      const parts = I$partitionNumberPattern(nf, value);
      for (let k = 0; k < parts.length; k++) {
        parts[k].unit = nfUnit;
        I$push(list, parts[k]);
      }
      if (!needSeparator) {
        if (style === '2-digit' || style === 'numeric') needSeparator = true;
        I$push(result, list);
      }
    }
    if (done) break;
  }
  const lo = { locale: o.locale, dataLocale: o.dataLocale, type: 'unit', style: o.style === 'digital' ? 'short' : o.style };
  const strings = [];
  for (let i = 0; i < result.length; i++) I$push(strings, I$partsToString(result[i]));
  let lparts = I$listParts(lo, strings), out = [], idx = 0;
  for (let i = 0; i < lparts.length; i++) {
    if (lparts[i].type === 'element') {
      const l = result[idx++];
      for (let k = 0; k < l.length; k++) I$push(out, l[k]);
    } else I$push(out, lparts[i]);
  }
  return out;
};
I$defineService(I$DurationFormat, 0, 'DurationFormat', {
  format(duration) {
    const o = I$thisSlots(this, 'an Intl.DurationFormat');
    return I$partsToString(I$durationParts(o, I$toDurationRecord(duration)));
  },
  formatToParts(duration) {
    const o = I$thisSlots(this, 'an Intl.DurationFormat');
    return I$partsToArray(I$durationParts(o, I$toDurationRecord(duration)), 'unit');
  },
  resolvedOptions() {
    const o = I$thisSlots(this, 'an Intl.DurationFormat'), f = u => o[u] === 'fractional' ? 'numeric' : o[u];
    return I$dropUndefined({
      locale: o.locale, numberingSystem: o.numberingSystem, style: o.style,
      years: f('years'), yearsDisplay: o.yearsDisplay, months: f('months'), monthsDisplay: o.monthsDisplay, weeks: f('weeks'), weeksDisplay: o.weeksDisplay,
      days: f('days'), daysDisplay: o.daysDisplay, hours: f('hours'), hoursDisplay: o.hoursDisplay, minutes: f('minutes'), minutesDisplay: o.minutesDisplay,
      seconds: f('seconds'), secondsDisplay: o.secondsDisplay, milliseconds: f('milliseconds'), millisecondsDisplay: o.millisecondsDisplay,
      microseconds: f('microseconds'), microsecondsDisplay: o.microsecondsDisplay, nanoseconds: f('nanoseconds'), nanosecondsDisplay: o.nanosecondsDisplay,
      fractionalDigits: o.fractionalDigits
    });
  }
});

const I$aboveClass = c => {
  if (c >= 0x300 && c <= 0x36f) return I$combiningClass(c);
  if ((c >= 0x1d185 && c <= 0x1d189) || (c >= 0x1d1aa && c <= 0x1d1ad) || (c >= 0x483 && c <= 0x487) || (c >= 0x20d0 && c <= 0x20dc && c !== 0x20d2 && c !== 0x20d3 && c !== 0x20d8 && c !== 0x20d9 && c !== 0x20da)) return 230;
  if (c === 0x101fd || (c >= 0x1d17b && c <= 0x1d182) || (c >= 0x1d165 && c <= 0x1d172) || (c >= 0x1ab0 && c <= 0x1aff) || (c >= 0x1dc0 && c <= 0x1dff)) return 1;
  return 0;
};
const I$moreAbove = (s, i) => {
  while (i < s.length) {
    const c = I$cpAt(s, i), k = I$aboveClass(c);
    if (k === 0) return false;
    if (k === 230) return true;
    i += c > 0xffff ? 2 : 1;
  }
  return false;
};
const I$transformCase = (s, locales, upper) => {
  const requested = I$canonicalizeLocaleList(locales);
  const lang = I$parseTag(requested.length ? I$removeUnicodeExt(requested[0]) : I$DEFAULT_LOCALE).lang;
  let out = '';
  if (lang === 'tr' || lang === 'az') {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (upper) out += c === 'i' ? '\u0130' : c === '\u0131' ? 'I' : c.toUpperCase();
      else if (c === '\u0130') out += 'i';
      else if (c === 'I') {
        let j = i + 1;
        while (j < s.length && I$aboveClass(I$cpAt(s, j)) !== 0 && I$aboveClass(I$cpAt(s, j)) !== 230) j += I$cpAt(s, j) > 0xffff ? 2 : 1;
        if (s[j] === '\u0307') {
          out += 'i' + s.slice(i + 1, j);
          i = j;
        } else out += '\u0131';
      } else out += c.toLowerCase();
    }
    return out;
  }
  if (lang === 'lt') {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!upper) {
        if ((c === 'I' || c === 'J' || c === '\u012e') && I$moreAbove(s, i + 1)) out += c.toLowerCase() + '\u0307';
        else if (c === '\u00cc') out += 'i\u0307\u0300';
        else if (c === '\u00cd') out += 'i\u0307\u0301';
        else if (c === '\u0128') out += 'i\u0307\u0303';
        else out += c.toLowerCase();
      } else {
        if (c === '\u0307') {
          // remove a dot above after a soft-dotted letter
          let k = i - 1;
          while (k >= 0 && I$aboveClass(s.charCodeAt(k)) !== 0 && I$aboveClass(s.charCodeAt(k)) !== 230) k--;
          const base = k >= 0 ? s[k] : '';
          if (base === 'i' || base === 'j' || base === '\u012f' || base === '\u0268' || base === '\u1e2d' || base === '\u1ecb') continue;
        }
        out += c.toUpperCase();
      }
    }
    return out;
  }
  return upper ? s.toUpperCase() : s.toLowerCase();
};
const I$thisNumberValue = x => typeof x === 'number' ? x : Number.prototype.valueOf.call(x);
const I$thisBigIntValue = x => typeof x === 'bigint' ? x : BigInt.prototype.valueOf.call(x);
const I$requireCoercibleString = (x, name) => {
  if (x === undefined || x === null) throw new TypeError('String.prototype.' + name + ' called on null or undefined');
  return I$toStr(x);
};
const I$dateToLocale = (x, locales, options, required, defaults) => {
  const t = Date.prototype.getTime.call(x);
  if (t !== t) return 'Invalid Date';
  return I$formatDateTime(I$createDateTimeFormat(locales, options, required, defaults), t);
};
$IntlHooks$ = {
  number(x, locales, options) {
    x = I$thisNumberValue(x);
    return I$formatNumber(I$initializeNumberFormat(locales, options), I$decFromNumber(x));
  },
  bigint(x, locales, options) {
    x = I$thisBigIntValue(x);
    return I$formatNumber(I$initializeNumberFormat(locales, options), I$toIntlMV(x));
  },
  localeCompare(x, that, locales, options) {
    const s = I$requireCoercibleString(x, 'localeCompare');
    that = I$toStr(that);
    const c = new I$Collator(locales, options);
    return I$compareStrings(I$internalSlots.get(c), s, that);
  },
  lower(x, locales) { return I$transformCase(I$requireCoercibleString(x, 'toLocaleLowerCase'), locales, false); },
  upper(x, locales) { return I$transformCase(I$requireCoercibleString(x, 'toLocaleUpperCase'), locales, true); },
  date(x, locales, options) { return I$dateToLocale(x, locales, options, 'any', 'all'); },
  temporal(x, kind, locales, options) {
    if (kind === 'Duration') return new I$DurationFormat(locales, options).format(x);
    const req = kind === 'PlainTime' ? 'time' : kind === 'PlainDate' || kind === 'PlainYearMonth' || kind === 'PlainMonthDay' ? 'date' : 'any';
    if (kind !== 'ZonedDateTime') {
      const o = I$createDateTimeFormat(locales, options, req, req === 'any' ? 'all' : req);
      return I$partsToString(I$dtParts(o, I$toDTValue(o, x)));
    }
    const oz = I$createDateTimeFormat(locales, options, 'any', 'all', x.timeZoneId);
    const cal = x.calendarId;
    if (cal !== 'iso8601' && cal !== oz.calendar) throw new RangeError('Calendar ' + cal + ' does not match the formatter calendar ' + oz.calendar);
    let v = I$instantValue(oz, x), explicitAny = false;
    for (const k in oz.explicit) if (oz.explicit[k] !== undefined) explicitAny = true;
    if (oz.dateStyle === undefined && oz.timeStyle === undefined && !explicitAny) v.c.timeZoneName = 'short';
    return I$partsToString(I$dtParts(oz, v));
  },
  dateDate(x, locales, options) { return I$dateToLocale(x, locales, options, 'date', 'date'); },
  dateTime(x, locales, options) { return I$dateToLocale(x, locales, options, 'time', 'time'); },
  array(x, locales, options) {
    let a = I$toObject(x), len = I$toLength(a.length), out = '';
    for (let k = 0; k < len; k++) {
      if (k > 0) out += ',';
      const e = a[k];
      if (e !== undefined && e !== null) out += I$toStr(e.toLocaleString(locales, options));
    }
    return out;
  }
};

// optional params read from arguments to keep the specified lengths
function __Number_prototype_toLocaleString() {
  'use strict';
  return $IntlHooks$.number(this, arguments[0], arguments[1]);
}
function __BigInt_prototype_toLocaleString() {
  'use strict';
  return $IntlHooks$.bigint(this, arguments[0], arguments[1]);
}
function __String_prototype_localeCompare(that) {
  'use strict';
  return $IntlHooks$.localeCompare(this, that, arguments[1], arguments[2]);
}
function __ByteString_prototype_localeCompare(that) {
  'use strict';
  return $IntlHooks$.localeCompare(this, that, arguments[1], arguments[2]);
}
function __String_prototype_toLocaleLowerCase() {
  'use strict';
  return $IntlHooks$.lower(this, arguments[0]);
}
function __ByteString_prototype_toLocaleLowerCase() {
  'use strict';
  return $IntlHooks$.lower(this, arguments[0]);
}
function __String_prototype_toLocaleUpperCase() {
  'use strict';
  return $IntlHooks$.upper(this, arguments[0]);
}
function __ByteString_prototype_toLocaleUpperCase() {
  'use strict';
  return $IntlHooks$.upper(this, arguments[0]);
}
function __Date_prototype_toLocaleString() {
  'use strict';
  return $IntlHooks$.date(this, arguments[0], arguments[1]);
}
function __Date_prototype_toLocaleDateString() {
  'use strict';
  return $IntlHooks$.dateDate(this, arguments[0], arguments[1]);
}
function __Date_prototype_toLocaleTimeString() {
  'use strict';
  return $IntlHooks$.dateTime(this, arguments[0], arguments[1]);
}
function __Array_prototype_toLocaleString() {
  'use strict';
  return $IntlHooks$.array(this, arguments[0], arguments[1]);
}
`;
