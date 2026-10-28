const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    url: { type: String, required: true, match: /^\/api\/images\/[a-f0-9]{32}$/ },
    alt: { type: String, trim: true, maxlength: 160, default: '' },
}, { _id: false });

const experienceSectionSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    images: {
        type: [imageSchema], default: [],
        validate: {
            validator: images => images.length <= 12 && new Set(images.map(image => image.url)).size === images.length,
            message: 'Choose up to 12 different images for a section.',
        },
    },
    published: { type: Boolean, default: false },
    order: { type: Number, default: 0, min: 0, max: 9999, validate: Number.isInteger },
}, { timestamps: true });

experienceSectionSchema.pre('validate', function () {
    if (this.published && !this.images.length) this.invalidate('images', 'Add at least one image before publishing.');
});
experienceSectionSchema.index({ published: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('ExperienceSection', experienceSectionSchema);
