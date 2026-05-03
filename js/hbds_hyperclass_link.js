export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js';
import { createLinkBetweenClass } from './hbds_class_link.js';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById);
}
