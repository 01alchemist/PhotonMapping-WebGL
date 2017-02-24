/**
 * Created by Nidin Vinayakan on 24/02/17.
 */
export class fs{
    static textFiles:Map<string,string> = new Map<string,string>();
    static binFiles:Map<string,Uint8Array> = new Map<string,Uint8Array>();

    static getTextFile(name:string):string {
        let file = fs.textFiles.get(name);
        if(!file){
            throw `Cannot find file ${name}`;
        }
        return file;
    }

    static addTextFile(name:string, content:string){
        fs.textFiles.set(name, content);
    }

    static getBinFile(name:string):Uint8Array {
        let file = fs.binFiles.get(name);
        if(!file){
            throw `Cannot find binary file ${name}`;
        }
        return file;
    }

    static addBinFile(name:string, content:Uint8Array){
        fs.binFiles.set(name, content);
    }

}