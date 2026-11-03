export const isIPv4 = s => {
  s = `${s}`;
  const parts = s.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (part.length === 0 || part.length > 3 || (part.length > 1 && part[0] === '0')) return false;
    for (let i = 0; i < part.length; i++) {
      const c = part.charCodeAt(i);
      if (c < 48 || c > 57) return false;
    }
    if (+part > 255) return false;
  }
  return true;
};

const isHexGroup = group => {
  if (group.length === 0 || group.length > 4) return false;
  for (let i = 0; i < group.length; i++) {
    const c = group.charCodeAt(i) | 32;
    if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) return false;
  }
  return true;
};

export const isIPv6 = s => {
  s = `${s}`;
  const zone = s.indexOf('%');
  if (zone !== -1) {
    if (!/^%[0-9a-zA-Z.:-]+$/.test(s.slice(zone))) return false;
    s = s.slice(0, zone);
  }

  // at most one ::, the groups around it plus an optional trailing ipv4 part
  const halves = s.split('::');
  if (halves.length > 2) return false;
  let count = 0;
  for (let h = 0; h < halves.length; h++) {
    if (halves[h] === '') continue;
    const groups = halves[h].split(':');
    for (let i = 0; i < groups.length; i++) {
      if (h === halves.length - 1 && i === groups.length - 1 && groups[i].includes('.')) {
        if (!isIPv4(groups[i])) return false;
        count += 2;
      } else if (isHexGroup(groups[i])) count++;
      else return false;
    }
  }
  return halves.length === 2 ? count < 8 : count === 8;
};

export const isIP = s => isIPv4(s) ? 4 : isIPv6(s) ? 6 : 0;
