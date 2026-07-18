export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js?v=perf-hardening-20260718a';
import { createLinkBetweenClass } from './hbds_class_link.js?v=perf-hardening-20260718a';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById, options);
}
