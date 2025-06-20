import MySQL from 'mysql';

export default (new class Database {
	Shutdown	= false;
	Connection	= null;
	
	setConfig(Config) {
		this.Connection = MySQL.createPool({
			connectionLimit:	Config.Database.CONNECTIONS,
			debug:				Config.Logging.MYSQL,
			host: 				Config.Database.HOSTNAME,
			port:				Config.Database.PORT,
			user: 				Config.Database.USERNAME,
			password:			Config.Database.PASSWORD,
			database:			Config.Database.DATABASE,
			charset:			Config.Database.CHARSET,
			timezone:			'Europe/Berlin',
			queryFormat:		(query, values) => {
				if(!values) {
					return query;
				}
				
				return query.replace(/\:(\w+)/g, (txt, key) => {
					if(values.hasOwnProperty(key)) {
						return MySQL.escape(values[key]);
					}
					
					return txt;
				});
			}
		});
	}
	
	destructor() {
		if(this.Shutdown) {
			return;
		}
		
		this.Shutdown = true;
		
		this.Connection.end((error) => {
			if(error) {
				console.log('Database', error);
			}
		});
	}
	
	now(date) {
		if(typeof(date) === 'undefined') {
			date = new Date();
		}
		
		const year		= date.getFullYear();
		const month		= (date.getMonth() + 1).toString().padStart(2, '0');
		const day		= date.getDate().toString().padStart(2, '0');
		const hours		= date.getHours().toString().padStart(2, '0');
		const minutes	= date.getMinutes().toString().padStart(2, '0');
		const seconds	= date.getSeconds().toString().padStart(2, '0');

		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	}
	
	single(query, data, object) {
		return new Promise((success, failure) => {
			if(this.Connection === null) {
				failure(new Error('Not configured'));
				return;
			}
			
			this.fetch(query, data, object).then((result) => {
				if(result.length === 0 || typeof(result[0]) === 'undefined') {
					success(null);
					return;
				}
				
				success(result[0]);
			}).catch(failure);		
		});
	}
	
	fetch(query, data, object) {
		if(typeof(object) === 'undefined') {
			object = null;
		}
		
		return new Promise((success, failure) => {
			if(this.Connection === null) {
				failure(new Error('Not configured'));
				return;
			}
			
			this.Connection.getConnection(function(connection_error, connection) {
				if(connection_error) {
					failure(connection_error);
					return;
				}
		
				connection.query(query, data, (query_error, results, fields) => {
					connection.release();
					
					if(query_error) {
						failure(query_error);
						return;
					}
					
					if(object !== null) {
						const construct = object.toString().match(/constructor\s*\(([^)]*)\)/);
						const args		= construct ? construct[1].split(',').map(arg => arg.trim()) : [];
						
						results.forEach((row, index) => {
							let instance = new object(...args.map(arg => row[arg]));
							
							/* Bind others */
							Object.entries(row).forEach(([ name, value ]) => {
								if(args.indexOf(name) === -1) {
									instance[name] = value;
								}
							});
							
							results[index] = instance;
						});
					}
					
					success(results);
				});
			});
		});
	}
	
	insert(table, parameters) {
		return new Promise((success, failure) => {
			if(this.Connection === null) {
				failure(new Error('Not configured'));
				return;
			}
			
			this.Connection.getConnection((connection_error, connection) => {
				if(connection_error) {
					failure(connection_error);
					return;
				}
				
				let names		= [];
				let values		= [];
				
				Object.entries(parameters).forEach(([ name, value ]) => {
					names.push('`' + name + '`');
					values.push(':' + name);
				});
				
				Object.entries(parameters).forEach(([ name, value ]) => {
					if(typeof(value) === 'number') {
						parameters[name] = value;
					} else if(typeof(value) === 'boolean') {
						parameters[name] = value ? 1 : 0;
					} else if(value === 'NOW()') {
						parameters[name] = this.now();
					}
				});
				
				let query = 'INSERT INTO `' + table + '` (' + names.join(', ') + ') VALUES (' + values.join(', ') + ')';
				
				connection.query(query, parameters, (query_error, result, fields) => {
					connection.release();
					
					if(query_error) {
						failure([ query_error, query, parameters ]);
						return;
					}
					
					success(result.insertId);
				});
			});
		});
	}
	
	update(table, where, parameters) {
		return new Promise((success, failure) => {
			if(this.Connection === null) {
				failure(new Error('Not configured'));
				return;
			}
			
			let fields	= [];
			let query	= null;
			
			Object.entries(parameters).forEach(([ name, value ]) => {
				if(value === 'NOW()') {
					parameters[name] = this.now();
				}
				
				fields.push('`' + name + '`=:' + name);
			});
			
			query	= 'UPDATE `' + table + '` SET ' + fields.join(', ') + ' WHERE ';
			
			if(Array.isArray(where)) {
				let checks	= [];
				
				where.forEach((entry) => {
					checks.push('`' + entry + '`=:' + entry);
				});
				
				query += checks.join(' AND ');
			} else {
				query = where + '`=:' + where;
			}
			
			this.Connection.getConnection(function(connection_error, connection) {
				if(connection_error) {
					failure(connection_error);
					return;
				}
			
				connection.query(query, parameters, (query_error, result, fields) => {
					connection.release();
					
					if(query_error) {
						failure(query_error);
						return;
					}
					
					success(result.affectedRows);
				});
			});
		});
	}
}());
