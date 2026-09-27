export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js?v=readability-20260927';
import { createLinkBetweenClass } from './hbds_class_link.js?v=readability-20260927';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById, options);
}
