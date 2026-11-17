const User = require('./User');
const Place = require('./Place');
const Review = require('./Review');
const Post = require('./Post');
const Alert = require('./Alert');
const VerificationCode = require('./VerificationCode');
const EventAttendee = require('./EventAttendee');
const OrganizerReview = require('./OrganizerReview');
const PostLike = require('./PostLike');

// ── User ──────────────────────────────────────────────────
User.hasMany(VerificationCode, { foreignKey: 'user_id', as: 'verificationCodes', onDelete: 'CASCADE' });
VerificationCode.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Place, { foreignKey: 'created_by', as: 'createdPlaces' });
Place.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

User.hasMany(Post, { foreignKey: 'user_id', as: 'posts', onDelete: 'CASCADE' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

// ── Place ─────────────────────────────────────────────────
Place.hasMany(Review, { foreignKey: 'place_id', as: 'reviews', onDelete: 'CASCADE' });
Review.belongsTo(Place, { foreignKey: 'place_id', as: 'place' });

Place.hasMany(Post, { foreignKey: 'place_id', as: 'posts', onDelete: 'SET NULL' });
Post.belongsTo(Place, { foreignKey: 'place_id', as: 'place' });

Place.hasMany(Alert, { foreignKey: 'place_id', as: 'alerts', onDelete: 'CASCADE' });
Alert.belongsTo(Place, { foreignKey: 'place_id', as: 'place' });

// ── EventAttendee ─────────────────────────────────────────
Place.hasMany(EventAttendee, { foreignKey: 'event_id', as: 'attendees', onDelete: 'CASCADE' });
EventAttendee.belongsTo(Place, { foreignKey: 'event_id', as: 'event' });

User.hasMany(EventAttendee, { foreignKey: 'user_id', as: 'eventAttendances', onDelete: 'CASCADE' });
EventAttendee.belongsTo(User, { foreignKey: 'user_id', as: 'attendee' });

// ── OrganizerReview ───────────────────────────────────────
OrganizerReview.belongsTo(User, { foreignKey: 'reviewer_id', as: 'reviewer' });
OrganizerReview.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });
OrganizerReview.belongsTo(Place, { foreignKey: 'event_id', as: 'event' });

User.hasMany(OrganizerReview, { foreignKey: 'organizer_id', as: 'organizerReviews', onDelete: 'CASCADE' });
User.hasMany(OrganizerReview, { foreignKey: 'reviewer_id', as: 'givenOrganizerReviews', onDelete: 'CASCADE' });
Place.hasMany(OrganizerReview, { foreignKey: 'event_id', as: 'organizerReviews', onDelete: 'CASCADE' });

// ── PostLike ──────────────────────────────────────────────
Post.hasMany(PostLike, { foreignKey: 'post_id', as: 'likes', onDelete: 'CASCADE' });
User.hasMany(PostLike, { foreignKey: 'user_id', as: 'postLikes', onDelete: 'CASCADE' });
PostLike.belongsTo(Post, { foreignKey: 'post_id' });
PostLike.belongsTo(User, { foreignKey: 'user_id' });

module.exports = { User, Place, Review, Post, Alert, VerificationCode, EventAttendee, OrganizerReview, PostLike };
