const mongoose = require('mongoose');
const ExperienceSection = require('../models/ExperienceSection');
const { syncImages } = require('../services/eventImages');
const { HttpError, respondError } = require('../utils/httpError');

const publicFields = 'title description images order createdAt updatedAt';
const imageReferences = section => ({ gallery: (section?.images || []).map(image => image.url) });
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);

function readInput(body, existing) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A JSON object is required.');
    const result = existing ? {
        title: existing.title, description: existing.description, images: existing.images.map(image => ({ url: image.url, alt: image.alt })),
        published: existing.published, order: existing.order,
    } : { title: '', description: '', images: [], published: false, order: 0 };
    for (const [field, max] of [['title', 120], ['description', 2000]]) {
        if (!Object.hasOwn(body, field)) continue;
        if (typeof body[field] !== 'string' || body[field].length > max) throw new HttpError(400, `${field === 'title' ? 'Title' : 'Description'} must be text of at most ${max} characters.`);
        result[field] = body[field].trim();
    }
    if (!result.title) throw new HttpError(400, 'Enter a section title.');
    if (Object.hasOwn(body, 'published')) {
        if (typeof body.published !== 'boolean') throw new HttpError(400, 'Published must be true or false.');
        result.published = body.published;
    }
    if (Object.hasOwn(body, 'order')) {
        if (!Number.isInteger(body.order) || body.order < 0 || body.order > 9999) throw new HttpError(400, 'Display order must be a whole number from 0 to 9999.');
        result.order = body.order;
    }
    if (Object.hasOwn(body, 'images')) {
        if (!Array.isArray(body.images) || body.images.length > 12) throw new HttpError(400, 'Choose up to 12 images for a section.');
        result.images = body.images.map(image => {
            if (!image || typeof image !== 'object' || Array.isArray(image) || typeof image.url !== 'string' || !/^\/api\/images\/[a-f0-9]{32}$/.test(image.url)) {
                throw new HttpError(400, 'Upload each section image through Evently.');
            }
            const alt = image.alt === undefined ? '' : image.alt;
            if (typeof alt !== 'string' || alt.length > 160) throw new HttpError(400, 'Image descriptions must be text of at most 160 characters.');
            return { url: image.url, alt: alt.trim() };
        });
        if (new Set(result.images.map(image => image.url)).size !== result.images.length) throw new HttpError(400, 'Choose different images; an image was added more than once.');
    }
    if (result.published && !result.images.length) throw new HttpError(400, 'Add at least one image before publishing.');
    return result;
}

exports.listPublished = async (req, res) => {
    try {
        const sections = await ExperienceSection.find({ published: true }).select(publicFields).sort({ order: 1, createdAt: 1, _id: 1 }).lean();
        return res.set('Cache-Control', 'no-store').json({ success: true, sections });
    } catch (error) { return respondError(res, error); }
};

exports.listAll = async (req, res) => {
    try {
        const sections = await ExperienceSection.find({}).select(`${publicFields} published`).sort({ order: 1, createdAt: 1, _id: 1 }).lean();
        return res.json({ success: true, sections });
    } catch (error) { return respondError(res, error); }
};

exports.create = async (req, res) => {
    try {
        const input = readInput(req.body);
        let section;
        await mongoose.connection.transaction(async session => {
            [section] = await ExperienceSection.create([input], { session });
            await syncImages(null, imageReferences(section), req.user, session);
        });
        return res.status(201).json({ success: true, section });
    } catch (error) { return respondError(res, error); }
};

exports.update = async (req, res) => {
    try {
        if (!validId(req.params.id)) throw new HttpError(400, 'Invalid section id.');
        let section;
        await mongoose.connection.transaction(async session => {
            section = await ExperienceSection.findById(req.params.id).session(session);
            if (!section) throw new HttpError(404, 'Section not found.');
            const before = imageReferences(section);
            section.set(readInput(req.body, section));
            await section.save({ session });
            await syncImages(before, imageReferences(section), req.user, session);
        });
        return res.json({ success: true, section });
    } catch (error) { return respondError(res, error); }
};

exports.remove = async (req, res) => {
    try {
        if (!validId(req.params.id)) throw new HttpError(400, 'Invalid section id.');
        await mongoose.connection.transaction(async session => {
            const section = await ExperienceSection.findById(req.params.id).session(session);
            if (!section) throw new HttpError(404, 'Section not found.');
            await section.deleteOne({ session });
            await syncImages(imageReferences(section), null, req.user, session);
        });
        return res.json({ success: true });
    } catch (error) { return respondError(res, error); }
};
