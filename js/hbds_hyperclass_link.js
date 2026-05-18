export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js?v=fit-font-20260517i';
import { createLinkBetweenClass } from './hbds_class_link.js?v=fit-font-20260517i';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById);
}
