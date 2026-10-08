export { Loader, updateLinkFontSizes, recalculateAllLinks } from './hbds_class_link.js?v=release-2.6.2';
import { createLinkBetweenClass } from './hbds_class_link.js?v=release-2.6.2';

export function createLinkBetweenHyperClass(scene, sourceObject, targetObject, linkData, options = {}) {
  const classById = new Map([
    [linkData.sourceClassId, sourceObject],
    [linkData.targetClassId, targetObject]
  ]);
  return createLinkBetweenClass(linkData, classById, options);
}
