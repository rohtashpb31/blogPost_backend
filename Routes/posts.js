const express = require("express");
const Users = require("../models/Users");
const article = require("../models/ArticleSchema");



const post = express.Router();

post.get('/all', async (req, res) => {
    try {
        const posts = await article.find({ isPublic: true });

        // Map through the results to include the count of likes
        const result = posts.map(post => ({
            _id: post._id,
            author: post.author,
            title: post.title,
            totalLikes: post.likes.length,
            publishTime: post.publishTime,
            tags: post.tags,
            views: post.views,
            images: post.images,
            videos: post.videos
        }));

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server error. Could not retrieve posts.' });
    }
});

post.get('/get/:postId', async (req, res) => {

    try {
        const { postId } = req.params;
        //request by author
        const posts = await article.find({ _id: postId, isPublic: true })

        posts.forEach(async (post) => {
            post.views = post.views + 1;
            await post.save();
        })
        // Map through the results to include the count of likes

        res.status(200).json(posts);



    } catch (error) {
        // Handle server errors
        res.status(500).json({ message: 'Server error. Could not retrieve post.' });
    }
});

// Middleware for authentication and OTP verification
post.use(async (req, res, next) => {
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

post.use("/:postId", async (req, res, next) => {
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
})

post.post("/:postId/comment", (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ message: 'Comment text is required.' });
    }
    try {
        req.blogPost.comments.push({
            user: req.user._id,
            text: text,
        })
        req.blogPost.save();
        // Respond with the updated post and success message
        return res.status(201).json({
            message: 'Comment added successfully.'
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error. Could not add comment.' });
    }
})


post.delete("/:postId/comment/:commentId", async (req, res) => {
    try {
        // Extract the commentId from the request parameters
        const { commentId } = req.params;
        // Find the index of the comment that needs to be deleted
        const commentIndex = await req.blogPost.comments.findIndex(comment => comment._id.toString() === commentId);

        // If the comment doesn't exist, return a 404 error
        if (commentIndex === -1) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        const comment = req.blogPost.comments[commentIndex];

        // Check if the current user is authorized to delete the comment user or author of post
        if (comment.user.toString() === req.user._id.toString() || req.blogPost.author.toString() === req.user._id.toString()) {


            // Remove the comment from the comments array
            req.blogPost.comments.splice(commentIndex, 1);

            // Save the updated blog post
            req.blogPost.save();

            // Respond with a success message and updated post
            return res.status(200).json({
                message: 'Comment deleted successfully.',
            });
        } else {
            return res.status(403).json({ message: 'You are not authorized to delete this comment.' });
        }
    } catch (error) {
        // If there's a server error, return a 500 response
        return res.status(500).json({ message: 'Server error. Could not delete comment.' });
    }
});


post.put("/:postId/like", async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // Check if the user has already liked the post
        const likeIndex = req.blogPost.likes.findIndex(like => like.toString() === userId);

        if (likeIndex === -1) {
            // If the user has not liked the post, add their ID to the likes array
            req.blogPost.likes.push(userId);
            await req.blogPost.save();
            return res.status(200).json({ message: 'Post liked successfully.' });
        } else {
            // If the user has already liked the post, return a message
            return res.status(400).json({ message: 'You have already liked this post.' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Server error. Could not like post.' });
    }
});

post.put("/:postId/unlike", async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // Check if the user has already liked the post
        const likeIndex = req.blogPost.likes.findIndex(like => like.toString() === userId);

        if (likeIndex !== -1) {
            // If the user has liked the post, remove their ID from the likes array
            req.blogPost.likes.splice(likeIndex, 1);
            await req.blogPost.save();
            return res.status(200).json({ message: 'Post unliked successfully.' });
        } else {
            // If the user has not liked the post, return a message
            return res.status(400).json({ message: 'You have not liked this post.' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Server error. Could not unlike post.' });
    }
});


module.exports = post;
