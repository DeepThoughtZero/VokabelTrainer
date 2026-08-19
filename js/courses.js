/**
 * Stable course metadata. Vocabulary files register their entries in
 * window.VOCABULARIES under the matching course id.
 */
window.VOCABULARIES = window.VOCABULARIES || {};

window.COURSES = Object.freeze([
    {
        id: 'en-5',
        grade: 5,
        subjectCode: 'en',
        subjectLabel: 'Englisch',
        targetLocale: 'en-GB',
        available: true
    },
    {
        id: 'en-6',
        grade: 6,
        subjectCode: 'en',
        subjectLabel: 'Englisch',
        targetLocale: 'en-GB',
        available: true
    },
    {
        id: 'fr-6',
        grade: 6,
        subjectCode: 'fr',
        subjectLabel: 'Französisch',
        targetLocale: 'fr-FR',
        available: false,
        unavailableReason: 'Die Französisch-Vokabeln werden noch vorbereitet.'
    },
    {
        id: 'la-6',
        grade: 6,
        subjectCode: 'la',
        subjectLabel: 'Latein',
        targetLocale: 'la',
        available: false,
        unavailableReason: 'Die Latein-Vokabeln werden noch vorbereitet.'
    }
]);

window.getCourseById = function getCourseById(courseId) {
    return window.COURSES.find(course => course.id === courseId) || null;
};

window.getCourseLabel = function getCourseLabel(courseOrId) {
    const course = typeof courseOrId === 'string' ? window.getCourseById(courseOrId) : courseOrId;
    return course ? `${course.subjectLabel} ${course.grade}` : '';
};
