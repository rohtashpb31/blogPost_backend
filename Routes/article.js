const express = require("express");
const Users = require("../models/Users");
const article = require("../models/ArticleSchema");
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const fs = require('fs');

const blogPosts = express.Router();

// Middleware for authentication and OTP verification
blogPosts.use(async (req, res, next) => {
    try {
        const token = req.cookies.authToken;
        const user = await Users.findByToken(token);

        if (!user) {
            return res.status(401).send({ message: 'Invalid or expired token' });
        }

        if (!user.otp.verified) {
            return res.status(401).send({ message: 'Please verify your otp.' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Authentication error', error });
    }
});

// Endpoint to create an empty blog post (no need of post id)
blogPosts.post('/new', async (req, res) => {
    try {
        if (!req.body.title) {
            return res.status(400).json({ message: 'Post title is required' });
        }
        const newPost = new article({
            author: req.user._id,
            title: req.body.title
        });

        await newPost.save();

        return res.status(201).json({
            message: 'Blog post created successfully!',
            post: newPost
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error creating new post', error });
    }
});

blogPosts.get('/all', async (req, res) => {
    try {
        const posts = await article.find({ "author": req.user._id });

        // Map through the results to include the count of likes
        const result = posts.map(post => ({
            _id: post._id,
            author: post.author,
            title: post.title,
            totalLikes: post.likes.length,
            publishTime: post.publishTime,
            tags: post.tags,
            isPublic: post.isPublic
        }));

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server error. Could not retrieve posts.' });
    }
});

blogPosts.get('/get/:postId', async (req, res) => {

    try {
        const { postId } = req.params;
        //request by author
        const posts = await article.find({ author: req.user._id, _id: postId })

        res.status(200).json(posts);



    } catch (error) {
        // Handle server errors
        res.status(500).json({ message: 'Server error. Could not retrieve post.' });
    }
});

const loadArticle = async (req, res, next) => {
    try {
        const blogPost = await article.findById(req.params.postId);
        if (!blogPost) {
            return res.status(404).json({ message: 'Blog post not found' });
        }
        req.blogPost = blogPost;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Error loading blog post', error });
    }
};

// Endpoint to edit an existing blog post
blogPosts.put('/edit/:postId', loadArticle, async (req, res) => {
    try {
        const { title, content, tags, isPublic } = req.body;
        const blogPost = req.blogPost;

        // Check if the current user is the author of the post
        if (blogPost.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to edit this post' });
        }

        // Update the blog post fields
        blogPost.title = title || blogPost.title;
        blogPost.content = content || blogPost.content;
        blogPost.tags = tags || blogPost.tags;
        blogPost.isPublic = isPublic ?? blogPost.isPublic;

        await blogPost.save();

        res.status(200).json({
            message: 'Blog post updated successfully!',
            post: blogPost
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating blog post', error });
    }
});

// Set up the multer storage and file naming for images and videos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            if (file.mimetype.startsWith('image/')) {
                cb(null, './uploads/images');  // Save to images directory
            } else if (file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') {
                cb(null, './uploads/videos');  // Save to videos directory
            } else {
                cb(new Error('Invalid file type'), false);
            }
        } catch (error) {
            cb(error, false);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname); // Generate a unique file name
        cb(null, uniqueName);  // Store file with unique name
    }
});

// Set up multer middleware with the storage configuration
const upload = multer({ storage });

// Endpoint to upload media (image/video) to a blog post
blogPosts.post('/uploadMedia/:postId', loadArticle, upload.single('media'), async (req, res) => {
    try {
        const blogPost = req.blogPost;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (req.file.mimetype.startsWith('image/')) {
            blogPost.images.push({
                name: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path.replace("uploads", "")
            });
        } else if (req.file.mimetype.startsWith('video/') || req.file.mimetype === 'application/octet-stream') {
            blogPost.videos.push({
                name: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path.replace("uploads", "")
            });
        } else {
            return res.status(400).json({ message: 'Unsupported file type' });
        }

        await blogPost.save();

        res.status(200).json({
            message: 'File uploaded successfully',
        });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading media', error });
    }
});

// Endpoint to delete a media file (image or video) from a blog post by unique name and type
blogPosts.delete('/deleteMedia/', async (req, res) => {
    const { postId, fileName } = req.body;

    if (!postId || !fileName) {
        return res.status(400).send({
            postId: !postId ? "postId is missing!" : undefined,
            fileName: !fileName ? "fileName is missing!" : undefined,
        });
    }

    try {
        const blogPost = await article.findById(postId);
        if (!blogPost) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        // Check if the current user is the author of the post
        if (blogPost.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to delete media from this post' });
        }

        let filePath;
        let deleted = false;

        // Find and delete the media by type and unique name
        const imageIndex = blogPost.images.findIndex(photo => photo.name === fileName);
        if (imageIndex !== -1) {
            filePath = path.join(__dirname, '../uploads/images', fileName);
            blogPost.images.splice(imageIndex, 1);  // Remove the image from the images array
            deleted = true;
        }

        if (!deleted) {
            const videoIndex = blogPost.videos.findIndex(video => video.name === fileName);
            if (videoIndex !== -1) {
                filePath = path.join(__dirname, '../uploads/videos', fileName);
                blogPost.videos.splice(videoIndex, 1);  // Remove the video from the videos array
                deleted = true;
            }
        }

        // Check if the media was found and deleted
        if (!deleted) {
            return res.status(404).json({ message: 'Media not found in the blog post' });
        }

        // Delete the file from the file system
        fs.unlink(filePath, async (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error deleting file from server', error: err });
            }

            // Save the updated blog post after media is removed
            await blogPost.save();

            res.status(200).json({ message: 'Media deleted successfully' });
        });

    } catch (error) {
        res.status(500).json({ message: 'Error deleting media', error });
    }
});

module.exports = blogPosts;
