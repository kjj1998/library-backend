const { createServer } = require('http')
const { execute, subscribe } = require('graphql')
const { SubscriptionServer } = require('subscriptions-transport-ws')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server-express')
const { PubSub } = require('graphql-subscriptions')

const pubsub = new PubSub()
const express = require('express')
const cors = require('cors')
const { v1: uuid } = require('uuid')
const mongoose = require('mongoose')

const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const jwt = require('jsonwebtoken')
const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'
const MONGODB_URI = 'mongodb+srv://admin:fullstackopen2021@mycluster.xnorb.mongodb.net/library?retryWrites=true&w=majority'

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI)
	.then(() => {
		console.log('connected to MongoDB')
	})
	.catch((error) => {
		console.log('error connection to MongoDB:', error.message)
	})

/*
 * English:
 * It might make more sense to associate a book with its author by storing the author's id in the context of the book instead of the author's name
 * However, for simplicity, we will store the author's name in connection with the book
*/

/* Schemas for the library */
const typeDefs = gql`
	type Book {
		title: String!
		published: Int!
		author: Author!
		id: ID!
		genres: [String]
	}
	type Author {
		name: String!
		born: Int
		id: ID!
	}
	type User {
		username: String!
		favoriteGenre: String!
		id: ID!
	}
	type Token {
		value: String!
		favoriteGenre: String!
	}
  type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author!]!
		me: User
  }
	type Mutation {
		addBook(
			title: String!
			author: String!
			published: Int!
			genres: [String]
		): Book
		editAuthor(
			name: String!
			setBornTo: Int!
		): Author
		createUser(
			username: String!
			favoriteGenre: String!
		): User
		login(
			username: String!
			password: String!
		): Token
	}
	type Subscription {
		bookAdded: Book!
	}
`

/* defines how GraphQL queries are responded to */
const resolvers = {
  Query: {
		bookCount: () => {
			return Book.collection.countDocuments()	// return the total number of books
		},
		authorCount: () => {
			return Author.collection.countDocuments()	// return the total number of authors
		},
		allBooks: async (root, args) => {
			if (args.author && args.genre) {
				/*
				 * If both optional parameters are present,
				 * return all books written by that author which belongs to
				 * that genre
				*/
				const author = await Author.findOne({ name: args.author }) // find the author
				const books = await Book.find({		// find all books that contain the specific genres and is written by the specific author
					genres: { $in: [args.genre] },
					author: { $in: [author._id] }
				})
				
				const unresolvedBooks = books.map(async (book) => await book.populate('author'))	// populate the author field
				const resolvedBooks = await Promise.all(unresolvedBooks)		// resolve the array of promises

				return resolvedBooks
			}
			else if (args.author) {
				/* 
				 * If only the optional parameter author is present,
				 * return all books written by that author
				*/
				const author = await Author.findOne({ name: args.author })
				
				/* Find all documents in the Book collection where the author field contains the id given */
				const books = await Book.find({
					author: { $in: [author._id] }
				})
				const unresolvedBooks = books.map(async (book) => await book.populate('author'))
				const resolvedBooks = await Promise.all(unresolvedBooks)

				return resolvedBooks
			}
			else if (args.genre) {
				/* 
				 * If only the optional parameter genre is present,
				 * return all books that belong to that genre
				*/

				/* Find all documents in the Book collection where the genres field contains the genres given */
				const books = await Book.find({
					genres: { $in: [args.genre] }
				})
				const unresolvedBooks = books.map(async (book) => await book.populate('author'))
				const resolvedBooks = await Promise.all(unresolvedBooks)

				return resolvedBooks
			}
			else {
				/* 
				 * Find all documents in the Book collection
				 */
				const books = await Book.find({})
				const unresolvedBooks = books.map(async (book) => await book.populate('author'))
				const resolvedBooks = await Promise.all(unresolvedBooks)

				return resolvedBooks
			}
		},
		allAuthors: async () => {
			/* 
			 * Loop through each author in the list and for each author
			 * loop through each book and increment bookCount if author of book
			 * matches name of the author. Return a list of the authors with 
			 * book counts.
			 */

			let authors = await Author.find({})
			return authors
		}
  },
	Mutation: {
		addBook: async (root, args, { currentUser }) => {
			/* 
			 * Add a book to the list of books in the library
			 */
			if (!currentUser) {
				throw new AuthenticationError("not authenticated")
			}

			if (args.title === "" || args.author === "" || args.published === null) {
				throw new UserInputError('The title, author and published fields must all have valid values')
			}

			if (args.title.length < 2) {
				throw new UserInputError('The length of the title must be at least 2 characters long')
			}

			// Throw a UserInputError if title is not unique
			if (await Book.findOne({ title: args.title })) {
        throw new UserInputError('Title must be unique', {
          invalidArgs: args.name,
        })
      }

			// Create author if author does not exist
			let author = await Author.findOne({ name: args.author })
			if (!author) {
				if (args.author.length < 4) {
					throw new UserInputError('The length of the author\'s name must be at least 4 characters long')
				}
				author = Author({ name: args.author, born: null })		// create new author using the Author schema
				try {
					await author.save()
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args,
					})
				}
			}

			const book = new Book({ ...args, author: author._id })	// create new book using the Book schema
			await book.populate('author')
			
			try {
				await book.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				})
			}

			pubsub.publish('BOOK_ADDED', { bookAdded: book})

			return book
		},
		editAuthor: async (root, args, { currentUser }) => {
			/*
			 * Look for an author in the list of authors and set his birth year.
			 * If the author is not present, return null, else return the author with
			 * his birth year set to the setBornTo parameter
			 */
			if (!currentUser) {
				throw new AuthenticationError("not authenticated")
			}

			const author = await Author.findOne({ name: args.name })
			author.born = args.setBornTo

			try {
				await author.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				})
			}
			
			return author
		},
		createUser: async (root, args) => {
			const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre })

			return user.save()
				.catch(error => {
					throw new UserInputError(error.message, {
						invalidArgs: args,
					})
				})
		},
		login: async (root, args) => {
			const user = await User.findOne({ username: args.username })

			if ( !user || args.password !== 'secret' ) {
				throw new UserInputError("wrong credentials")
			}

			/* creates user token */
			const userForToken = {
				username: user.username,
				id: user._id,
			}

			return { 
				value: jwt.sign(userForToken, JWT_SECRET),
				favoriteGenre: user.favoriteGenre 
			}	// signs the user token using jsonwebtoken
		},
	},
	Subscription: {
		bookAdded: {
			subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
		},
	},
}

const Start = async () => {
	const app = express()
	app.use(cors())

	const httpServer = createServer(app)

	const schema = makeExecutableSchema({
		typeDefs,
		resolvers
	})
	const subscriptionServer = SubscriptionServer.create(
		{ schema, execute, subscribe },
		{ server: httpServer, path: '/graphql' }
	)

	const server = new ApolloServer({
		schema,
		plugins: [{
			async serverWillStart() {
        return {
          async drainServer() {
            subscriptionServer.close();
          }
        };
      }
		}],
		context: async ({ req }) => {
			const auth = req ? req.headers.authorization : null		// retrieve the headers authorization if it exists
			
			/* verify token is correct and find the current user from the database */
			if (auth && auth.toLowerCase().startsWith('bearer ')) {
				const decodedToken = jwt.verify(
					auth.substring(7), JWT_SECRET
				)
				let currentUser = await User.findById(decodedToken.id)
				return { currentUser }
			}
		}
	})
	await server.start()
	server.applyMiddleware({ app })

	const PORT = 4000
	httpServer.listen(PORT, () => {
    console.log(`Server is now running on http://localhost:${PORT}/graphql`)
	});
}

Start()

/*
const server = new ApolloServer({
  typeDefs,		// the GraphQL schema
  resolvers,
	context: async ({ req }) => {
		const auth = req ? req.headers.authorization : null		// retrieve the headers authorization if it exists
		
		verify token is correct and find the current user from the database
		if (auth && auth.toLowerCase().startsWith('bearer ')) {
			const decodedToken = jwt.verify(
				auth.substring(7), JWT_SECRET
			)
			let currentUser = await User.findById(decodedToken.id)
			return { currentUser }
		}
	}
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})*/