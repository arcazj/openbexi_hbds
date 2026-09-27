export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js?v=layout-20260926a';
import { createLinkBetweenClass } from './hbds_class_link.js?v=layout-20260926a';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById, options);
}
