const { ApolloServer, gql } = require('apollo-server')

let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  { 
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  { 
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

/*
 * Suomi:
 * Saattaisi olla järkevämpää assosioida kirja ja sen tekijä tallettamalla kirjan yhteyteen tekijän nimen sijaan tekijän id
 * Yksinkertaisuuden vuoksi tallennamme kuitenkin kirjan yhteyteen tekijän nimen
 *
 * English:
 * It might make more sense to associate a book with its author by storing the author's id in the context of the book instead of the author's name
 * However, for simplicity, we will store the author's name in connection with the book
*/

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: 'Robert Martin',
    id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: 'Robert Martin',
    id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
    genres: ['agile', 'patterns', 'design']
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: 'Martin Fowler',
    id: "afa5de00-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: 'Joshua Kerievsky',
    id: "afa5de01-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'patterns']
  },  
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: 'Sandi Metz',
    id: "afa5de02-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'design']
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: 'Fyodor Dostoevsky',
    id: "afa5de03-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'crime']
  },
  {
    title: 'The Demon ',
    published: 1872,
    author: 'Fyodor Dostoevsky',
    id: "afa5de04-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'revolution']
  },
]

/* Schemas for the library */
const typeDefs = gql`
	type Book {
		title: String!
		published: Int!
		author: String!
		id: ID!
		genres: [String]
	}
	type Author {
		name: String!
		born: Int
		id: ID!
		bookCount: Int
	}
  type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks: [Book!]!
		allAuthors: [Author!]!
  }
`

/* defines how GraphQL queries are responded to */
const resolvers = {
  Query: {
		bookCount: () => {
			return books.length	// return the total number of books
		},
		authorCount: () => {
			return authors.length	// return the total number of authors
		},
		allBooks: () => {
			return books	// return the array of all Book objects
		},
		allAuthors: () => {
			/* 
			 * Loop through each author in the list and for each author
			 * loop through each book and increment bookCount if author of book
			 * matches name of the author. Return a list of the authors with 
			 * book counts.
			 */ 
			let authorsWithBookCount = []
			authors.map(author => {
				let bookCount = 0
				books.map(book => {
					 if (book.author === author.name) {
						 bookCount += 1
					 }
				})
				const authorWithBookCount = { ...author, bookCount }
				authorsWithBookCount = authorsWithBookCount.concat(authorWithBookCount)
			})
			
			return authorsWithBookCount
		}
  }
}

const server = new ApolloServer({
  typeDefs,		// the GraphQL schema
  resolvers,
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})